import type { VercelRequest,VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const db=()=>createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const hash=(v:string)=>crypto.createHash("sha256").update(v).digest("hex");
function cookie(req:VercelRequest,name:string){const m=(req.headers.cookie||"").match(new RegExp("(?:^|;\\s*)"+name+"=([^;]*)"));return m?decodeURIComponent(m[1]):null}
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=="POST") return res.status(405).json({error:"method"});
 const site=process.env.SITE_PASSWORD;if(!site||cookie(req,"site_auth")!==hash(site))return res.status(401).json({error:"trusted_session_required"});
 const {approvalToken}=req.body||{};if(!approvalToken)return res.status(400).json({error:"approval_token_required"});
 const now=new Date().toISOString();
 const {data,error}=await db().from("device_pairings").update({status:"approved",approved_at:now}).eq("approval_hash",hash(approvalToken)).eq("status","pending").gt("expires_at",now).select("id").maybeSingle();
 if(error||!data)return res.status(404).json({error:"pairing_not_found_or_expired"});
 return res.status(200).json({status:"approved"});
}