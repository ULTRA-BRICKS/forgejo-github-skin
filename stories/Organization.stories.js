import {organizationPage} from './organization-page.mjs';
export default {title:'Screens/Organization'};
export const Overview={render:()=>organizationPage()};
export const PublicView={render:()=>organizationPage({member:false})};
export const Dark={render:()=>organizationPage({surface:'dark'})};
export const EmptyResults={render:()=>organizationPage({empty:true})};
export const Loading={render:()=>organizationPage({loading:true})};
