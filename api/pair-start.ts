import type { VercelRequest,VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const db=()=>createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const hash=(v:string)=>crypto.createHash("sha256").update(v).digest("hex");
export default async function handler(req:VercelRequest,res:VercelResponse){
 if(req.method!=="POST") return res.status(405).json({error:"method"});
 const requestToken=crypto.randomBytes(32).toString("base64url");
 const approvalToken=crypto.randomBytes(32).toString("base64url");
 const {data,error}=await db().from("device_pairings").insert({request_hash:hash(requestToken),approval_hash:hash(approvalToken)}).select("id,expires_at").single();
 if(error) return res.status(500).json({error:"pairing_unavailable"});
 return res.status(201).json({pairingId:data.id,requestToken,approvalToken,expiresAt:data.expires_at});
}