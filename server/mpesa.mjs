import { fail } from './security.mjs';
export function paymentConfig(env=process.env) {
  const mode=env.MPESA_MODE||'disabled';
  const enabled=['sandbox','production'].includes(mode)&&['MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET','MPESA_SHORTCODE','MPESA_PASSKEY','MPESA_CALLBACK_SECRET'].every(k=>env[k])&&env.MPESA_CALLBACK_SECRET.length>=32&&/^https:\/\//.test(env.PUBLIC_ORIGIN||'');
  return {mode,enabled};
}
export function createMpesa(env=process.env, request=fetch) {
  const base=env.MPESA_MODE==='production'?'https://api.safaricom.co.ke':'https://sandbox.safaricom.co.ke';
  async function call(path,data) {
    if(!paymentConfig(env).enabled) fail(503,'Online giving is not yet available. Please contact the church office.');
    const auth=await request(base+'/oauth/v1/generate?grant_type=client_credentials',{headers:{Authorization:'Basic '+Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString('base64')},signal:AbortSignal.timeout(15000)});
    const credentials=await auth.json();
    if(!auth.ok||!credentials.access_token) fail(502,'M-Pesa could not connect. Please try again later.');
    const response=await request(base+path,{method:'POST',headers:{Authorization:`Bearer ${credentials.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok) fail(502,'M-Pesa is temporarily unavailable. Please try again later.');
    return result;
  }
  function common() {
    const Timestamp=new Date(Date.now()+3*3600000).toISOString().replace(/\D/g,'').slice(0,14);
    return {BusinessShortCode:env.MPESA_SHORTCODE,Password:Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${Timestamp}`).toString('base64'),Timestamp};
  }
  return {
    async initiate({id,phone,amount,purpose}) {
      return call('/mpesa/stkpush/v1/processrequest',{...common(),TransactionType:env.MPESA_TRANSACTION_TYPE||'CustomerPayBillOnline',Amount:amount,PartyA:phone,PartyB:env.MPESA_SHORTCODE,PhoneNumber:phone,CallBackURL:`${env.PUBLIC_ORIGIN}/api/mpesa/callback/${env.MPESA_CALLBACK_SECRET}`,AccountReference:'VWO'+id.slice(0,8),TransactionDesc:purpose});
    },
    async query(checkout) { return call('/mpesa/stkpushquery/v1/query',{...common(),CheckoutRequestID:checkout}); }
  };
}
