"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type Sev = "emergency"|"urgent"|"routine"|"recommended";
const SEV: Sev[] = ["emergency","urgent","routine","recommended"];
type DB={public:{Tables:{profiles:{Row:{id:string;shop_id:string|null}};property_properties:{Row:{id:string;name:string}};property_units:{Row:{id:string;property_id:string;unit_label:string}};property_assets:{Row:{id:string;property_id:string;unit_id:string|null;name:string}};property_maintenance_requests:{Insert:{shop_id:string;property_id:string;unit_id:string|null;asset_id:string|null;requester_profile_id:string;title:string;summary:string;category:string|null;severity:Sev;status:"open";source:"internal";access_notes:string|null;preferred_window:string|null}}}}};
const client=()=>createServerSupabaseRSC() as unknown as SupabaseClient<DB>;
const v=(x:FormDataEntryValue|null)=>typeof x==="string"&&x.trim()?x.trim():null;

export async function createPropertyMaintenanceRequest(formData: FormData){
  const supabase=client();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/sign-in');
  const [{data:profile},{data:properties},{data:units},{data:assets}] = await Promise.all([
    supabase.from('profiles').select('id,shop_id').eq('id',user.id).maybeSingle(),
    supabase.from('property_properties').select('id,name').order('name'),
    supabase.from('property_units').select('id,property_id,unit_label').order('unit_label'),
    supabase.from('property_assets').select('id,property_id,unit_id,name').order('name'),
  ]);
  if(!profile?.shop_id) redirect('/property/requests/new?error='+encodeURIComponent('Your profile is missing shop_id.'));
  const property_id=v(formData.get('property_id')); const unit_id=v(formData.get('unit_id')); const asset_id=v(formData.get('asset_id'));
  const title=v(formData.get('title')); const summary=v(formData.get('summary')); const category=v(formData.get('category')); const access_notes=v(formData.get('access_notes')); const preferred_window=v(formData.get('preferred_window'));
  const severity=(v(formData.get('severity'))??'routine') as Sev;
  if(!title||!summary) redirect('/property/requests/new?error='+encodeURIComponent('Title and summary are required.'));
  if(!property_id||!(properties??[]).some(p=>p.id===property_id)) redirect('/property/requests/new?error='+encodeURIComponent('Selected property is not visible.'));
  if(!SEV.includes(severity)) redirect('/property/requests/new?error='+encodeURIComponent('Invalid severity.'));
  const unit=unit_id?(units??[]).find(u=>u.id===unit_id):null;
  if(unit_id&&(!unit||unit.property_id!==property_id)) redirect('/property/requests/new?error='+encodeURIComponent('Selected unit is invalid for the chosen property.'));
  const asset=asset_id?(assets??[]).find(a=>a.id===asset_id):null;
  if(asset_id&&(!asset||asset.property_id!==property_id)) redirect('/property/requests/new?error='+encodeURIComponent('Selected asset is invalid for the chosen property.'));
  if(unit&&asset&&asset.unit_id!==unit.id&&asset.unit_id!==null) redirect('/property/requests/new?error='+encodeURIComponent('Selected asset must belong to selected unit, or be shared for property.'));
  const {error}=await supabase.from('property_maintenance_requests').insert({shop_id:profile.shop_id,property_id,unit_id:unit?.id??null,asset_id:asset?.id??null,requester_profile_id:user.id,title,summary,category,severity,status:'open',source:'internal',access_notes,preferred_window});
  if(error) redirect('/property/requests/new?error='+encodeURIComponent(`Unable to create request: ${error.message}`));
  revalidatePath('/property'); redirect('/property');
}
