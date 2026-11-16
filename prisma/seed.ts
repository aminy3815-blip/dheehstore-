import { PrismaClient, Role, ProducerStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DESIGNATED_OWNER_EMAIL, isDesignatedOwnerEmail } from '../src/lib/owner';
const db = new PrismaClient();
const categories = [
 ['Electronics','electronics','⌁'],['Fashion','fashion','✳'],['Coffee & Food','coffee-food','☕'],['Home & Living','home-living','⌂'],['Beauty','beauty','✿'],['Agriculture','agriculture','❋'],['Books & Education','books-education','▤'],['Sports','sports','◉'],['Automotive','automotive','⚙'],['Medical Supplies','medical-supplies','＋'],['Construction','construction','▰']
];
async function main(){
 const designatedOwnerEmail=DESIGNATED_OWNER_EMAIL;
 const cats:any={}; for(const [name,slug,icon] of categories) cats[slug]=await db.category.upsert({where:{slug},update:{},create:{name,slug,icon}});
 const pw=await bcrypt.hash('Demo1234!',12);
 const demoUsers=[
  {email:'coffee@demo.dheehstore.local',name:'Demo Coffee House',shop:'Buna Origins',city:'Addis Ababa',district:'Bole',status:ProducerStatus.APPROVED},
  {email:'craft@demo.dheehstore.local',name:'Demo Artisan Collective',shop:'Habesha Loom',city:'Harar',district:'Jugol',status:ProducerStatus.APPROVED},
  {email:'home@demo.dheehstore.local',name:'Demo Home Store',shop:'Abay Home',city:'Dire Dawa',district:'Kezira',status:ProducerStatus.APPROVED}
 ];
 for(const s of demoUsers){let u=await db.user.upsert({where:{email:s.email},update:{},create:{name:s.name,email:s.email,passwordHash:pw,role:Role.PRODUCER}});let shop=await db.shop.upsert({where:{ownerId:u.id},update:{},create:{ownerId:u.id,name:s.shop,slug:s.shop.toLowerCase().replaceAll(' ','-'),description:'A demonstration shop sharing thoughtfully selected Ethiopian products.',city:s.city,district:s.district,status:s.status,verified:false}});void shop;}
 const shops=await db.shop.findMany({include:{owner:true}});
 const data=[
  ['Yirgacheffe Single-Origin Coffee','Bright floral notes from the highlands. Carefully roasted in small batches.','coffee-food',2350,40,'coffee@demo.dheehstore.local','https://images.unsplash.com/photo-1559525839-b184a4d698c7?auto=format&fit=crop&w=900&q=85'],
  ['Sidamo Wildflower Honey','Raw highland honey with a delicate floral finish. 500 g jar.','coffee-food',980,25,'coffee@demo.dheehstore.local','https://images.unsplash.com/photo-1587049352851-8d4e89133924?auto=format&fit=crop&w=900&q=85'],
  ['Handwoven Tibeb Scarf','A contemporary handwoven cotton scarf with traditional Tibeb detail.','fashion',1850,12,'craft@demo.dheehstore.local','https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=900&q=85'],
  ['Leather Everyday Sandals','Comfortable handcrafted leather sandals for everyday wear.','fashion',3200,8,'craft@demo.dheehstore.local','https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=85'],
  ['Samsung Galaxy A55','128 GB, 5G-ready smartphone. Demonstration listing.','electronics',28900,6,'home@demo.dheehstore.local','https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=85'],
  ['Walnut Side Table','Compact solid-wood accent table, locally crafted.','home-living',7800,4,'home@demo.dheehstore.local','https://images.unsplash.com/photo-1499933374294-4584851497cc?auto=format&fit=crop&w=900&q=85'],
  ['Smallholder Seed Starter Kit','Seasonal vegetable seed assortment with a practical growing guide.','agriculture',1450,30,'coffee@demo.dheehstore.local','https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=85'],
  ['Laptop Sleeve — Canvas','Padded 14-inch sleeve made from durable woven canvas.','fashion',2100,10,'craft@demo.dheehstore.local','https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85'],
  ['Natural Shea Body Butter','Rich, fragrance-light body butter in a reusable glass jar.','beauty',1250,18,'home@demo.dheehstore.local','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85'],
 ];
 for(const [name,description,cat,price,stock,email,imageUrl] of data){const shop=shops.find(x=>x.owner.email===email)!;const slug=String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');await db.product.upsert({where:{shopId_slug:{shopId:shop.id,slug}},update:{},create:{shopId:shop.id,categoryId:cats[cat].id,name:String(name),slug,description:String(description),imageUrl:String(imageUrl),price:Number(price),stock:Number(stock),featured:Number(price)>5000}})}
 await db.marketplaceSettings.upsert({where:{id:'marketplace'},update:{},create:{id:'marketplace',platformName:'DHEEHSTORE',globalCommissionBps:0}});
 const configuredOwnerEmail=process.env.OWNER_EMAIL?.trim().toLowerCase();
 const ownerPassword=process.env.OWNER_PASSWORD;
 if(ownerPassword&&!ownerPassword.includes('change-this')){
  if(!isDesignatedOwnerEmail(configuredOwnerEmail))throw new Error(`OWNER_EMAIL must be ${designatedOwnerEmail} to provision the designated owner.`);
  if(ownerPassword.length<12||!/[a-z]/.test(ownerPassword)||!/[A-Z]/.test(ownerPassword)||!/[0-9]/.test(ownerPassword)||!/[^A-Za-z0-9]/.test(ownerPassword))throw new Error('OWNER_PASSWORD must be at least 12 characters and include upper-case, lower-case, number, and symbol characters.');
  await db.user.updateMany({where:{role:Role.OWNER,email:{not:designatedOwnerEmail}},data:{role:Role.CUSTOMER}});
  const passwordHash=await bcrypt.hash(ownerPassword,12);
  await db.user.upsert({where:{email:designatedOwnerEmail},update:{role:Role.OWNER,passwordHash,accountStatus:'ACTIVE',suspensionReason:null},create:{name:'DHEEHSTORE Owner',email:designatedOwnerEmail,passwordHash,role:Role.OWNER}});
 }
}
main().finally(()=>db.$disconnect());
