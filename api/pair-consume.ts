import type { VercelRequest,VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const db=()=>createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const hash=(v:string)=>crypto.createHash("sha256").update(v).digest("hex");
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=="POST")return res.status(405).json({error:"method"});
 const {requestToken}=req.body||{};if(!requestToken)return res.status(400).json({error:"request_token_required"});
 const now=new Date().toISOString();
 const {data}=await db().from("device_pairings").select("id,status,expires_at").eq("request_hash",hash(requestToken)).maybeSingle();
 if(!data||new Date(data.expires_at)<=new Date())return res.status(410).json({status:"expired"});
 if(data.status!=="approved")return res.status(202).json({status:data.status});
 const site=process.env.SITE_PASSWORD;if(!site)return res.status(503).json({error:"auth_unavailable"});
 const token=hash(site);
 const {error}=await db().from("device_pairings").update({status:"consumed",consumed_at:now}).eq("id",data.id).eq("status","approved");
 if(error)return res.status(409).json({error:"pairing_already_consumed"});
 res.setHeader("Set-Cookie",`site_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
 return res.status(200).json({status:"consumed",redirect:"/capture"});
}