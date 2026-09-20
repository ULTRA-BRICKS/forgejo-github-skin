import fs from 'node:fs/promises';
import path from 'node:path';
import {renderGraphic,closeRenderer} from '../../integrations/link-preview/raster.mjs';
import {previewFixtures} from '../../stories/preview-fixtures.mjs';
const file=path.resolve(import.meta.dirname,'../../assets/slack-examples/code.png');
try{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,await renderGraphic({...previewFixtures.file,previewVariant:'code'}));console.log('Rendered syntax-highlighted public fixture:',file);}finally{await closeRenderer();}
