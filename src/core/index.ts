import { IPanelDisplay } from './interface';
import {
  initSchema
} from './utils';

import exportMod from './exportMod';

import { initConfig } from './consts';

module.exports = function (schema, option) {
  // 设置一些参数
  option.scale = 750 / ((option.responsive && option.responsive.width) || 750);
  const dslConfig = Object.assign(
    {
      scale: option.scale,
      cssUnit: 'rpx',
      htmlFontSize: 16,
    },
    option._.get(schema, 'imgcook.dslConfig')
  );

  // 初始化全局参数
  initConfig(dslConfig);

  // 初始化处理
  initSchema(schema);


  let panelDisplay: IPanelDisplay[] = [];
  panelDisplay = panelDisplay.concat(exportMod(schema, option));


  return {
    panelDisplay: panelDisplay,
    // renderData: {
    //   template: template,
    //   imports: imports,
    //   datas: datas,
    //   methods: methods,
    //   lifeCycles: lifeCycles,
    //   styles: styles
    // },
    noTemplate: true
  };
};
