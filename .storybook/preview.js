import '@fontsource-variable/mona-sans';
import '../stories/storybook.css';
export default {
  parameters:{layout:'fullscreen',a11y:{test:'error'},backgrounds:{disable:true}},
  decorators:[story=>{document.documentElement.dataset.theme='hypergithub-light';return story();}],
};
