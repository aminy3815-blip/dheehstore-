import RegisterForm from './RegisterForm';
export default async function Page({searchParams}:{searchParams:Promise<{role?:string}>}){const params=await searchParams;return <RegisterForm initialRole={params.role}/>}
