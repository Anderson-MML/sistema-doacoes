const express=require('express');
const { randomUUID }=require('node:crypto');
const V=require('./validation');
const SEC=require('./security');
const { ApiError,fail }=require('./errors');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function createApp({ store,config,clock=()=>new Date(),logger=console }) {
  const app=express();app.disable('x-powered-by');app.set('trust proxy',config.proxyHops || false);
  app.use((req,res,next)=> {
    req.requestId=randomUUID();res.set({ 'X-Request-Id':req.requestId,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store' });
    const origin=req.get('Origin');
    if (origin && !config.origins.includes(origin)) return next(new ApiError(403,'ORIGEM_INVALIDA','Origem não permitida.'));
    if (origin) { res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key');res.set('Access-Control-Allow-Methods','GET, POST, PUT, PATCH, DELETE, OPTIONS'); }
    if (req.method==='OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit:'32kb',strict:true }));
  const requireAdmin=wrap(async(req,res,next)=> {
    const raw=SEC.bearer(req);
    if (!raw) fail(401,'NAO_AUTORIZADO','Autenticação necessária.');
    const user=await store.session(raw,clock());
    if (!user) fail(401,'NAO_AUTORIZADO','Sessão inválida ou expirada.');
    if (user.cargo!=='Administrador') fail(403,'ACESSO_NEGADO','Acesso restrito aos administradores da ONG.');
    req.user=user;req.sessionToken=raw;next();
  });
  const bookingHash=req=> {
    const raw=SEC.bearer(req);if (!raw) fail(401,'NAO_AUTORIZADO','Token do agendamento necessário.');return SEC.hash(raw);
  };
  const dummyHash=SEC.hashPassword(SEC.token());
  app.get('/health',(req,res)=>res.json({ status:'ok',service:'lar-ternura-api',timestamp:clock().toISOString() }));
  app.get('/ready',wrap(async(req,res)=> { await store.ready();res.json({ status:'ok',database:'connected' }); }));
  app.post('/auth/login',SEC.limiter(10,15*60*1000),wrap(async(req,res)=> {
    V.object(req.body,['email','senha']);const email=V.email(req.body.email);const password=V.string(req.body.senha,'Senha',128);
    const user=await store.userByEmail(email);
    const encoded=user?.senha_hash?.startsWith('scrypt$') ? user.senha_hash : await dummyHash;
    const valid=await SEC.verifyPassword(password,encoded);
    if (!user || user.cargo!=='Administrador' || !user.senha_hash.startsWith('scrypt$') || !valid) fail(401,'LOGIN_INVALIDO','E-mail ou senha inválidos.');
    const raw=SEC.token();const expires=new Date(clock().getTime()+config.sessionHours*3600000);
    await store.createSession(user.id_usuario,raw,expires);
    res.json({ token:raw,tipo:'Bearer',expira_em:expires.toISOString(),usuario:{ id_usuario:user.id_usuario,nome:user.nome,email:user.email,cargo:user.cargo } });
  }));
  app.get('/auth/me',requireAdmin,(req,res)=>res.json(req.user));
  app.post('/auth/logout',requireAdmin,wrap(async(req,res)=> { await store.revoke(req.sessionToken);res.sendStatus(204); }));
  app.get('/categorias',wrap(async(req,res)=>res.json(await store.categories())));
  const filters=req=>({ ...V.pagination(req.query), q:req.query.q===undefined ? null : V.string(req.query.q,'Busca',100),
    categoria:req.query.categoria===undefined ? null : V.string(req.query.categoria,'Categoria',50),
    prioridade:req.query.prioridade===undefined ? null : V.id(req.query.prioridade) });
  app.get('/itens',wrap(async(req,res)=>res.json(await store.items(filters(req)))));
  app.get('/necessidades',wrap(async(req,res)=>res.json(await store.items(filters(req)))));
  app.get('/itens/:id',wrap(async(req,res)=>res.json(await store.item(V.id(req.params.id)))));
  app.get('/admin/itens',requireAdmin,wrap(async(req,res)=>res.json(await store.items(filters(req),true))));
  app.get('/admin/itens/:id',requireAdmin,wrap(async(req,res)=>res.json(await store.product(V.id(req.params.id)))));
  app.post('/itens',requireAdmin,wrap(async(req,res)=> { const item=await store.saveItem(null,V.item(req.body));res.location(`/admin/itens/${item.id_item}`).status(201).json(item); }));
  app.put('/itens/:id',requireAdmin,wrap(async(req,res)=>res.json(await store.saveItem(V.id(req.params.id),V.item(req.body)))));
  app.delete('/itens/:id',requireAdmin,wrap(async(req,res)=> { await store.archiveItem(V.id(req.params.id));res.sendStatus(204); }));
  app.get('/disponibilidade',wrap(async(req,res)=> {
    const day=V.date(req.query.data);
    const horarios=await store.availability(day);
    res.json({ data:day,fuso_horario:'America/Sao_Paulo',horarios:horarios.map(h=> ({ ...h,
      vagas:(day+' '+h.horario+':00')<=V.localTime(clock()) ? 0 : h.vagas })) });
  }));
  app.post('/agendamentos',SEC.limiter(60,3600000),wrap(async(req,res)=> {
    const key=req.get('Idempotency-Key');
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) fail(422,'CHAVE_OBRIGATORIA','Envie Idempotency-Key aleatória de 16 a 128 caracteres; preserve-a ao repetir o envio.');
    const result=await store.createBooking(V.booking(req.body),key,clock());
    res.location(`/agendamentos/${result.agendamento.id_agendamento}`).status(result.repetido ? 200 : 201).json(result);
  }));
  app.get('/agendamentos/:id',wrap(async(req,res)=>res.json(await store.booking(V.id(req.params.id),bookingHash(req)))));
  app.patch('/agendamentos/:id/cancelar',wrap(async(req,res)=>res.json(await store.changeBooking(V.id(req.params.id),bookingHash(req)))));
  app.patch('/agendamentos/:id/remarcar',wrap(async(req,res)=> {
    V.object(req.body,['data','horario']);res.json(await store.changeBooking(V.id(req.params.id),bookingHash(req),V.slot(req.body,config,clock())));
  }));
  app.get('/admin/agendamentos',requireAdmin,wrap(async(req,res)=> {
    const data=req.query.data===undefined ? null : V.date(req.query.data);const status=req.query.status;
    if (status!==undefined && !['Pendente','Confirmado','Concluído','Cancelado'].includes(status)) fail(422,'VALIDACAO','Status inválido.');
    res.json(await store.bookings({ ...V.pagination(req.query),data,status }));
  }));
  app.get('/admin/agendamentos/:id',requireAdmin,wrap(async(req,res)=>res.json(await store.booking(V.id(req.params.id),null,store.db,true))));
  app.patch('/admin/agendamentos/:id/cancelar',requireAdmin,wrap(async(req,res)=>res.json(await store.changeBooking(V.id(req.params.id),null,null,true))));
  app.patch('/admin/agendamentos/:id/remarcar',requireAdmin,wrap(async(req,res)=> {
    V.object(req.body,['data','horario']);res.json(await store.changeBooking(V.id(req.params.id),null,V.slot(req.body,config,clock()),true));
  }));
  app.post('/doacoes',requireAdmin,wrap(async(req,res)=> {
    const result=await store.receive(V.receipt(req.body),V.uuid(req.get('Idempotency-Key')),req.user.id_usuario);
    res.location(`/doacoes/${result.doacao.id_doacao}`).status(result.repetido ? 200 : 201).json(result);
  }));
  app.get('/doacoes',requireAdmin,wrap(async(req,res)=>res.json(await store.donations(V.pagination(req.query)))));
  app.get('/doacoes/:id',requireAdmin,wrap(async(req,res)=>res.json(await store.donation(V.bigId(req.params.id)))));

  app.post('/admin/necessidades',requireAdmin,wrap(async(req,res)=>res.status(201).json(await store.openNeed(V.need(req.body),req.user.id_usuario))));
  for(const [action,status] of [['encerrar','Encerrada'],['cancelar','Cancelada']]) app.patch('/admin/necessidades/:id/'+action,requireAdmin,wrap(async(req,res)=>res.json(await store.closeNeed(V.bigId(req.params.id),status,req.user.id_usuario))));
  app.post('/admin/necessidades/:id/renovar',requireAdmin,wrap(async(req,res)=>res.status(201).json(await store.closeNeed(V.bigId(req.params.id),'Encerrada',req.user.id_usuario,V.need(req.body,true)))));
  app.get('/admin/necessidades/historico',requireAdmin,wrap(async(req,res)=>res.json(await store.history(V.pagination(req.query)))));
  app.get('/admin/arrecadacao/mensal',requireAdmin,wrap(async(req,res)=>{
    const month=req.query.mes??null;if(month!==null&&(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)))fail(422,'VALIDACAO','Mês inválido. Use AAAA-MM.');
    res.json(await store.monthly(month,V.pagination(req.query)));
  }));
  app.patch('/doacoes/:id/estornar',requireAdmin,wrap(async(req,res)=>{V.object(req.body,['motivo']);res.json(await store.reverse(V.bigId(req.params.id),req.user.id_usuario,V.string(req.body.motivo,'Motivo',500)));}));
  app.patch('/admin/agendamentos/:id/concluir',requireAdmin,wrap(async(req,res)=>{V.object(req.body,['motivo_pendencias']);res.json(await store.conclude(V.id(req.params.id),req.user.id_usuario,req.body.motivo_pendencias===undefined?null:V.string(req.body.motivo_pendencias,'Motivo das pendências',500)));}));
  app.use((req,res)=>res.status(404).json({ erro:{ codigo:'ROTA_INEXISTENTE',mensagem:'Rota não encontrada.' },request_id:req.requestId }));
  app.use((err,req,res,next)=> {
    if (res.headersSent) return next(err);
    let status=err.status || 500,code=err.code || 'ERRO_INTERNO',message=err.message;
    if (err.type==='entity.parse.failed') { status=400;code='JSON_INVALIDO';message='JSON inválido.'; }
    else if (err.type==='entity.too.large') { status=413;code='CORPO_GRANDE';message='Requisição muito grande.'; }
    else if (err.code==='23503') { status=422;code='REFERENCIA_INVALIDA';message='Referência a registro inexistente.'; }
    else if (err.code==='23505') { status=409;code='CONFLITO';message='Registro já existente.'; }
    else if (err.code==='22003' || err.code==='23514') { status=422;code='QUANTIDADE_INVALIDA';message='Quantidade fora do limite permitido.'; }
    else if (err.code==='P0001') { status=409;code='REGRA_DO_BANCO';message='Operação incompatível com as regras do banco. Confira produto, meta, unidade, data e situação da entrega.'; }
    else if (!(err instanceof ApiError)) { status=503;code='SERVICO_INDISPONIVEL';message='Serviço indisponível. Tente novamente.';logger.error({ request_id:req.requestId,codigo:err.code || 'INTERNAL' }); }
    res.status(status).json({ erro:{ codigo:code,mensagem:message },request_id:req.requestId });
  });
  return app;
}
module.exports = { createApp };
