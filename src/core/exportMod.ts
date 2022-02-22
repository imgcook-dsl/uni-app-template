import { IPanelDisplay, IImport } from './interface';

const kebabCase = require('lodash/kebabCase');

import { DSL_CONFIG, prettierVueOpt, prettierCssOpt, prettierScssOpt } from './consts'
import { isExpression, toString, parseStyle, generateCSS, generateScss } from './utils';

export default function exportMod(schema, option): IPanelDisplay[] {
  const { _, prettier } = option;

  // template
  const template: string[] = [];

  // imports
  const imports: string[] = [];

  // Global Public Functions
  const utils: string[] = [];

  // data
  const datas: string[] = [];

  const constants = {};

  // methods
  const methods: string[] = [];

  const expressionName = {};

  // lifeCycles
  const lifeCycles: string[] = [];

  // styles
  // style
  const styleMap = {};

  // box relative style
  const boxStyleList = [
    'fontSize',
    'marginTop',
    'marginBottom',
    'paddingTop',
    'paddingBottom',
    'height',
    'top',
    'bottom',
    'width',
    'maxWidth',
    'left',
    'right',
    'paddingRight',
    'paddingLeft',
    'marginLeft',
    'marginRight',
    'lineHeight',
    'borderBottomRightRadius',
    'borderBottomLeftRadius',
    'borderTopRightRadius',
    'borderTopLeftRadius',
    'borderRadius'
  ];

  // no unit style
  const noUnitStyles = ['opacity', 'fontWeight'];

  // exclude style
  const excludeStyles = ['fontFamily'];

  const lifeCycleMap = {
    _constructor: 'created',
    getDerivedStateFromProps: 'beforeUpdate',
    render: '',
    componentDidMount: 'mounted',
    componentDidUpdate: 'updated',
    componentWillUnmount: 'beforeDestroy'
  };

  const width = option.responsive.width || 750;
  const viewportWidth = option.responsive.viewportWidth || 375;
  const htmlFontSize = DSL_CONFIG.htmlFontSize || 16;

  // 1vw = width / 100
  const _w = width / 100;

  const _ratio = width / viewportWidth;
  let isPage = false;


  const transformEventName = (name) => {
    return name.replace('on', '').toLowerCase();
  };


  // parse function, return params and content
  const parseFunction = (func) => {
    const funcString = func.toString();
    const name = funcString.slice(funcString.indexOf('function'), funcString.indexOf('(')).replace('function ', '');
    const params = funcString.match(/\([^\(\)]*\)/)[0].slice(1, -1);
    const content = funcString.slice(funcString.indexOf('{') + 1, funcString.lastIndexOf('}'));
    return {
      params,
      content,
      name
    };
  };

  // parse layer props(static values or expression)
  const parseProps = (value, isReactNode?, constantName?) => {
    if (typeof value === 'string') {
      if (isExpression(value)) {
        if (isReactNode) {
          return `{{${value.slice(7, -2)}}}`;
        } else {
          return value.slice(2, -2);
        }
      }

      if (isReactNode) {
        return value;
      } else if (constantName) {
        // save to constant
        expressionName[constantName] = expressionName[constantName] ? expressionName[constantName] + 1 : 1;
        const name = `${constantName}${expressionName[constantName]}`;
        constants[name] = value;
        return `"constants.${name}"`;
      } else {
        return `"${value}"`;
      }
    } else if (typeof value === 'function') {
      const { params, content, name } = parseFunction(value);
      expressionName[name] = expressionName[name] ? expressionName[name] + 1 : 1;
      methods.push(`${name}_${expressionName[name]}(${params}) {${content}}`);
      return `${name}_${expressionName[name]}`;
    } else {
      return `"${value}"`;
    }
  };

  const parsePropsKey = (key, value) => {
    if (typeof value === 'function') {
      return `@${transformEventName(key)}`;
    } else {
      return `:${key}`;
    }
  };

  // parse async dataSource
  const parseDataSource = (data) => {
    const name = data.id;
    const { uri, method, params } = data.options;
    const action = data.type;
    let payload = {};

    switch (action) {
      case 'fetch':
        if (imports.indexOf(`import {fetch} from whatwg-fetch`) === -1) {
          imports.push(`import {fetch} from 'whatwg-fetch'`);
        }
        payload = {
          method: method
        };

        break;
      case 'jsonp':
        if (imports.indexOf(`import {fetchJsonp} from fetch-jsonp`) === -1) {
          imports.push(`import jsonp from 'fetch-jsonp'`);
        }
        break;
    }

    Object.keys(data.options).forEach((key) => {
      if (['uri', 'method', 'params'].indexOf(key) === -1) {
        payload[key] = toString(data.options[key]);
      }
    });

    // params parse should in string template
    if (params) {
      payload = `${toString(payload).slice(0, -1)} ,body: ${isExpression(params)
        ? parseProps(params)
        : toString(params)}}`;
    } else {
      payload = toString(payload);
    }

    let result = `{
      ${action}(${parseProps(uri)}, ${toString(payload)})
        .then((response) => response.json())
    `;

    if (data.dataHandler) {
      const { params, content } = parseFunction(data.dataHandler);
      result += `.then((${params}) => {${content}})
        .catch((e) => {
          console.log('error', e);
        })
      `;
    }

    result += '}';

    return `${name}() ${result}`;
  };

  // parse condition: whether render the layer
  const parseCondition = (condition, render) => {
    let _condition = isExpression(condition) ? condition.slice(2, -2) : condition;
    if (typeof _condition === 'string') {
      _condition = _condition.replace('this.', '');
    }
    render = render.replace(/^<\w+\s/, `${render.match(/^<\w+\s/)[0]} v-if="${_condition}" `);
    return render;
  };

  // parse loop render
  const parseLoop = (loop, loopArg, render) => {
    let data;
    let loopArgItem = (loopArg && loopArg[0]) || 'item';
    let loopArgIndex = (loopArg && loopArg[1]) || 'index';

    if (Array.isArray(loop)) {
      data = 'loopData';
      datas.push(`${data}: ${toString(loop)}`);
    } else if (isExpression(loop)) {
      data = loop.slice(2, -2).replace('this.state.', '');
    }
    // add loop key
    const tagEnd = render.indexOf('>');
    const keyProp = render.slice(0, tagEnd).indexOf('key=') == -1 ? `:key="${loopArgIndex}"` : '';
    render = `
      ${render.slice(0, tagEnd)}
      v-for="(${loopArgItem}, ${loopArgIndex}) in ${data}"  
      ${keyProp}
      ${render.slice(tagEnd)}`;

    // remove `this`
    const re = new RegExp(`this.${loopArgItem}`, 'g');
    render = render.replace(re, loopArgItem);

    return render;
  };


  // style filter
  const styleFilter = (style) => {
    const extraClasses: string[] = [],
      newStyle = {},
      flexKeys = ['display', 'alignItems', 'flexDirection', 'justifyContent', 'flexWrap', 'flex'];
    if (style) {
      _.forEach(style, (value, key) => {
        if (flexKeys.includes(key)) {
          const str = `${kebabCase(key)}: ${value}`;
          const obj = {
            'display: flex': 'flex',
            'flex: 1': 'flex-1',
            'flex-direction: column': 'column',
            'flex-wrap: wrap': 'wrap',
            'align-items: flex-end': 'align-end',
            'align-items: center': 'align-center',
            'align-items: baseline': 'align-baseline',
            'align-items: stretch': 'align-stretch',
            'justify-content: flex-end': 'justify-end',
            'justify-content: center': 'justify-center',
            'justify-content: space-between': 'justify-between',
            'justify-content: space-around': 'justify-around'
          };
          if (obj[str]) {
            extraClasses.push(obj[str]);
          } else {
            const exclude = ['flex-direction: row', 'align-items: flex-start', 'justify-content: flex-start'];
            if (!exclude.includes(str)) {
              newStyle[key] = value;
            }
          }
        } else {
          const str = `${kebabCase(key)}: ${value}`;
          const exclude = ['white-space: pre-wrap'];
          if (!exclude.includes(str)) {
            newStyle[key] = value;
          }
        }
      });
    }
    return {
      extraClasses,
      newStyle
    };
  };

  // generate render xml
  const generateRender = (schema): string => {
    const type = schema.componentName.toLowerCase();
    const className = schema.props && schema.props.className;

    // const { extraClasses, newStyle } = styleFilter(_.get(schema.props, 'style'));
    const newStyle = _.get(schema.props, 'style');
    const classList: string[] = [];
    _.set(schema.props, 'style', newStyle);

    let classString = '',
      styleString = '';

    if (className && !_.isEmpty(newStyle)) {

      styleMap[className] = parseStyle(schema.props.style);

      classList.push(className);
    } else if (!_.isEmpty(newStyle)) {
      styleString = ` style="${parseStyle(schema.props.style)}"`;
    }

    if (classList.length) {
      classString = ` class="${classList.join(' ')}"`;
    }

    let xml;
    let props = '';

    Object.keys(schema.props).forEach((key) => {
      if (['className', 'style', 'text', 'src', 'lines', 'dealGradient'].indexOf(key) === -1) {
        props += ` ${parsePropsKey(key, schema.props[key])}=${parseProps(schema.props[key])}`;
      }
    });
    switch (type) {
      case 'text':
        const innerText = parseProps(schema.props.text, true);
        xml = `<text${classString}${styleString}${props}>${innerText}</text> `;
        break;
      case 'image':
      case 'picture':
        let source = parseProps(schema.props.src, false);
        if (!source.match('"')) {
          source = `"${source}"`;
          xml = `<image${classString}${styleString}${props} :src=${source} /> `;
        } else {
          xml = `<image${classString}${styleString}${props} src=${source} /> `;
        }
        break;
      case 'div':
      case 'page':
      case 'block':
      case 'component':
        if (schema.children && schema.children.length) {
          xml = `<div${classString}${styleString}${props}>${transform(schema.children)}</div>`;
        } else {
          xml = `<div${classString}${styleString}${props} />`;
        }
        break;
      default:
        if (schema.children && schema.children.length) {
          xml = `<div${classString}${styleString}${props}>${transform(schema.children)}</div>`;
        } else {
          xml = `<div${classString}${styleString}${props} />`;
        }
    }

    if (schema.loop) {
      xml = parseLoop(schema.loop, schema.loopArgs, xml);
    }
    if (schema.condition) {
      xml = parseCondition(schema.condition, xml);
    }
    return xml || '';
  };

  // parse schema
  const transform = (schema, flag?): string => {
    let result: string = '';

    if (flag && schema.componentName === 'Page') {
      isPage = true;
    }

    if (Array.isArray(schema)) {
      schema.forEach((layer) => {
        result += transform(layer);
      });
    } else {
      let type = schema.componentName.toLowerCase();
      if (isPage && type === 'block') {
        type = 'div';
      }
      if (['page', 'block', 'component'].indexOf(type) !== -1) {
        // 容器组件处理: state/method/dataSource/lifeCycle/render
        const init: string[] = [];

        if (schema.state) {
          datas.push(`${toString(schema.state).slice(1, -1)}`);
        }

        if (schema.methods) {
          Object.keys(schema.methods).forEach((name) => {
            const { params, content } = parseFunction(schema.methods[name]);
            methods.push(`${name}(${params}) {${content}}`);
          });
        }

        if (schema.dataSource && Array.isArray(schema.dataSource.list)) {
          schema.dataSource.list.forEach((item) => {
            if (typeof item.isInit === 'boolean' && item.isInit) {
              init.push(`this.${item.id}();`);
            } else if (typeof item.isInit === 'string') {
              init.push(`if (${parseProps(item.isInit)}) { this.${item.id}(); }`);
            }
            methods.push(parseDataSource(item));
          });

          if (schema.dataSource.dataHandler) {
            const { params, content } = parseFunction(schema.dataSource.dataHandler);
            methods.push(`dataHandler(${params}) {${content}}`);
            init.push(`this.dataHandler()`);
          }
        }

        if (schema.lifeCycles) {
          if (!schema.lifeCycles['_constructor']) {
            lifeCycles.push(`${lifeCycleMap['_constructor']}() { ${init.join('\n')}}`);
          }

          Object.keys(schema.lifeCycles).forEach((name) => {
            const vueLifeCircleName = lifeCycleMap[name] || name;
            const { params, content } = parseFunction(schema.lifeCycles[name]);

            if (name === '_constructor') {
              lifeCycles.push(`${vueLifeCircleName}() {${content} ${init.join('\n')}}`);
            } else {
              lifeCycles.push(`${vueLifeCircleName}() {${content}}`);
            }
          });
        }
        template.push(generateRender(schema));
      } else {
        result += generateRender(schema);
      }
    }
    return result;
  };

  if (option.utils) {
    Object.keys(option.utils).forEach((name) => {
      utils.push(`const ${name} = ${option.utils[name]}`);
    });
  }

  // start parse schema
  transform(schema, true);
  datas.push(`constants: ${toString(constants)}`);


  const indexVue = `
  <template>
    ${template}
  </template>
  <script>
    ${imports.join('\n')}
    export default {
      data() {
        return {
          ${datas.join(',\n')}
        } 
      },
      methods: {
        ${methods.join(',\n')}
      },
      ${lifeCycles.join(',\n')}
    }
  </script>
  <style scoped lang="${DSL_CONFIG.cssType}">
@import './index.${DSL_CONFIG.cssType}';
</style>
`
  const panelDisplay = [
    {
      panelName: `index.vue`,
      panelValue: prettier.format(indexVue, prettierVueOpt
      ),
      panelType: 'vue'
    }]


  if (DSL_CONFIG.cssType === 'css') {
    panelDisplay.push({
      panelName: 'index.css',
      panelValue: prettier.format(generateCSS(styleMap), prettierCssOpt),
      panelType: 'css'
    })
  } else {
    panelDisplay.push({
      panelName: 'index.' + DSL_CONFIG.cssType,
      panelValue: prettier.format(generateScss(schema), prettierScssOpt),
      panelType: DSL_CONFIG.cssType
    })
  }



  return panelDisplay;
};
