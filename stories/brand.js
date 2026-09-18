import raw from "../assets/forgejo-graphite.svg?raw";
export const forgejoMark=(size=32)=>raw.replace("<svg ",`<svg width="${size}" height="${size}" role="img" aria-label="Forgejo" `);
