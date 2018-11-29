import * as defaultRule from './rules';
import { messages as defaultMessages} from './dictionary';
import { normalizeRules } from './utils';

export default (options={})=>{
    options = {
        ignoreErrorRule: ['required'],
        ...options
    }

    const MESSAGES = {...defaultMessages, ...options.messages};

    Object.keys(defaultRule).map(item => {
        defaultRule[item]['getMessage'] = MESSAGES[item]? MESSAGES[item]: MESSAGES['_default'];
    })
    const VALIDATOR = {...defaultRule, ...options.rule};

    return (vm, type)=>{
        if (~['Page', 'Component'].indexOf(type)) {
            if (!vm.data) vm.data = {};
            vm.data.$form = {};

            vm.$$normalize = function(map){
                return Object.keys(map).reduce((prev, key)=>{
                    if(typeof map[key] === 'object') {
                        return prev.concat(this.$$normalize(map[key]));
                    }

                    if (!~prev.indexOf(map[key]) && !~options.ignoreErrorRule.indexOf(key)) {
                        return prev.concat(map[key]);
                    }
                }, [])
            }

            vm.$clearErrorMsg = function({detail: {value}, currentTarget: {dataset: {rule, as, name, opts={}}}}){
                if(!this.data.$form || !this.data.$form.errMap || !this.data.$form.errMap[name])  return;

                delete this.data.$form.errMap[name];

                this.setData({
                    '$form.errMap': this.data.$form.errMap,
                    '$form.errMsgs': this.$$normalize(this.data.$form.errMap)
                })
            }

            vm.$validate = function({detail: {value}, currentTarget: {dataset: {rule, as, name, opts={}}}}) {

                if (rule == null || name == null) return console.warn('[form-wxa-plugin]需要指定data-rule和data-name');

                let $errMap = {};
                let rules = normalizeRules(rule);
                let invalid = true;

                if(value && typeof value === 'string') value = value.replace(/^\s*|\s*$/g, '');
                if (options.ignoreSpace || opts.ignoreSpace) value = value.replace(/\s/g, '');

                try {
                    invalid = Object.keys(rules).some((ruleName)=>{
                        if (VALIDATOR[ruleName] == null) return console.warn(`${ruleName}校验规则不存在`);

                        let generator = VALIDATOR[ruleName];
                        if (!generator.validate(value, rules[ruleName])) {
                            let msg = generator.getMessage(as||name, rules[ruleName]);
                            $errMap[name] = $errMap[name] || {};

                            $errMap[name][ruleName] = msg;

                            return true;
                        }
                    });
                } catch (e) {
                    console.error(e);
                }

                let errorMap = {
                    ...this.data.$form.$errMap,
                    ...$errMap,
                };

                this.setData({
                    '$form.dirty': true,
                    [`$form.valid.${name}`]: !invalid,
                    '$form.errMap': errorMap,
                    '$form.errMsgs': this.$$normalize(errorMap),
                });

                return !invalid;
            };

            vm.$type = function({detail: {value}, currentTarget: {dataset: {name}}}) {
                value = typeof value === 'string'? value.trim(): value;
                this.setData({[name]: value});
            };

            vm.$typeAndValidate = function(e) {
                this.$type(e);
                this.$validate(e);
            };

            vm.$validateAll = function(except = '') {
                return new Promise((resolve, reject)=>{
                    let q = wx.createSelectorQuery();

                    if(type === 'Component') q.in(this);

                    let self = this;

                    q.selectAll('.wxa-input')
                        .fields({
                            dataset: true,
                            id: true,
                            properties: ['value'],
                        }, function(res) {
                            // console.log(res)
                            self.$$wxaInputEvent = res;
                            if(res == null || res.length ===0) {
                                console.warn('没有找到类名为wxa-input的Input组件')
                                resolve(true);
                            }

                            let valid = res.every(({value, dataset})=>{
                                // console.log(dataset.name);
                                // console.log(except);
                                if(dataset.name === except) return true;
                                // console.log(value, dataset)
                                return self.$validate({currentTarget: {dataset}, detail: {value}})
                            });

                            // console.log(valid)
                            return resolve({valid, ...res});
                        })
                        .exec()

                })
            }
        }
    };
};
