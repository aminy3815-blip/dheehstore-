export const money=(value:number)=>`${new Intl.NumberFormat('en-ET').format(value)} ETB`;
export const moneySantim=(value:number)=>`${new Intl.NumberFormat('en-ET',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100)} ETB`;
