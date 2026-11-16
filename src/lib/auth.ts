import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { canAccessOwner } from './owner';
const key=()=>{const value=process.env.SESSION_SECRET;if(process.env.NODE_ENV==='production'&&(!value||value.length<32))throw new Error('SESSION_SECRET must be configured with at least 32 characters.');return value||'development-only-change-this-session-secret'};
export function sign(value:string){return createHmac('sha256',key()).update(value).digest('hex')}
export async function setSession(userId:string){const jar=await cookies();const expires=Math.floor(Date.now()/1000)+60*60*24*14;const payload=`${userId}.${expires}`;const token=`${payload}.${sign(payload)}`;jar.set('dheeh_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*14})}
export async function getUser(){const jar=await cookies();const value=jar.get('dheeh_session')?.value;if(!value)return null;const [id,expires,signature]=value.split('.');if(!id||!expires||!signature||Number(expires)<=Math.floor(Date.now()/1000))return null;const payload=`${id}.${expires}`;const expected=Buffer.from(sign(payload));const actual=Buffer.from(signature);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;const user=await db.user.findUnique({where:{id},include:{shop:true}});return user?.accountStatus==='ACTIVE'?user:null}
export async function getOwner(){const user=await getUser();return user&&canAccessOwner(user.role,user.email)?user:null}
export async function clearSession(){(await cookies()).delete('dheeh_session')}
