import "server-only";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import { createPropertyMaintenanceRequest } from "./actions";

type Sev = "emergency"|"urgent"|"routine"|"recommended";
const SEV: Sev[] = ["emergency","urgent","routine","recommended"];

type DB={public:{Tables:{profiles:{Row:{id:string;shop_id:string|null}};property_properties:{Row:{id:string;name:string}};property_units:{Row:{id:string;property_id:string;unit_label:string}};property_assets:{Row:{id:string;property_id:string;unit_id:string|null;name:string}};property_maintenance_requests:{Row:{id:string};Insert:{shop_id:string;property_id:string;unit_id:string|null;asset_id:string|null;requester_profile_id:string;title:string;summary:string;category:string|null;severity:Sev;status:"open";source:"internal";access_notes:string|null;preferred_window:string|null}}}}};
const client=()=>createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export default async function NewPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
  const p=(await searchParams)??{}; const err=Array.isArray(p.error)?p.error[0]:p.error;
  const supabase=client(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/sign-in');
  const [{data:profile},{data:properties},{data:units},{data:assets}] = await Promise.all([
    supabase.from('profiles').select('id,shop_id').eq('id',user.id).maybeSingle(),
    supabase.from('property_properties').select('id,name').order('name'),
    supabase.from('property_units').select('id,property_id,unit_label').order('unit_label'),
    supabase.from('property_assets').select('id,property_id,unit_id,name').order('name'),
  ]);
  if(!profile?.shop_id) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6">Profile is missing shop context.</div></main>;
  if(!(properties??[]).length) return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-3xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><h1 className="text-2xl">New maintenance request</h1><p className="mt-2 text-sm text-neutral-300">No properties are visible yet.</p><Link href="/property/setup" className="mt-4 inline-flex rounded-full border px-4 py-2 text-xs">Go to property setup</Link></div></main>;
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(193,122,74,0.18),transparent_34%),#020617] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/40 p-6"><div className="mb-4 flex justify-between"><h1 className="text-2xl">New maintenance request</h1><Link href="/property" className="text-xs underline">Back</Link></div>{err?<div className="mb-4 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-sm">{err}</div>:null}<form action={createPropertyMaintenanceRequest} className="grid gap-3 md:grid-cols-2"><select name="property_id" required className="rounded border bg-black/50 p-2 md:col-span-2"><option value="">Select property</option>{(properties??[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select name="unit_id" className="rounded border bg-black/50 p-2"><option value="">None</option>{(units??[]).map(u=><option key={u.id} value={u.id}>{u.unit_label} · {(properties??[]).find(p=>p.id===u.property_id)?.name??'Unknown property'}</option>)}</select><select name="asset_id" className="rounded border bg-black/50 p-2"><option value="">None</option>{(assets??[]).map(a=>{const prop=(properties??[]).find(p=>p.id===a.property_id)?.name??'Unknown property'; const unit=a.unit_id?((units??[]).find(u=>u.id===a.unit_id)?.unit_label??'Unknown unit'):'Shared'; return <option key={a.id} value={a.id}>{a.name} · {prop} · {unit}</option>;})}</select><input name="title" required placeholder="Title" className="rounded border bg-black/50 p-2 md:col-span-2"/><textarea name="summary" required rows={4} placeholder="Summary" className="rounded border bg-black/50 p-2 md:col-span-2"/><input name="category" placeholder="Category" className="rounded border bg-black/50 p-2"/><select name="severity" defaultValue="routine" className="rounded border bg-black/50 p-2">{SEV.map(s=><option key={s} value={s}>{s}</option>)}</select><input name="access_notes" placeholder="Access notes" className="rounded border bg-black/50 p-2"/><input name="preferred_window" placeholder="Preferred window" className="rounded border bg-black/50 p-2"/><button type="submit" className="rounded-full border border-[color:var(--accent-copper)]/70 bg-[color:var(--accent-copper)]/20 px-4 py-2 text-xs font-semibold uppercase md:col-span-2">Create request</button></form></div></main>;
}
