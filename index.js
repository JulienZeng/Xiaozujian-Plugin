logger.info(logger.yellow("- 正在加载 米游社小组件 插件"))

import axios from 'axios'
import md5 from 'md5'
import lodash from 'lodash'
import fs from "fs"
import YAML from 'yaml'

import makeConfig from "../../lib/plugins/config.js"

const { config, configSave } = await makeConfig("AutoCheckResin", {
    user: []
}, {})

export class Xiaozujian extends plugin {
    constructor() {
        super({
            name: "小组件",
            dsc: "原神桌面小组件数据",
            /** https://oicqjs.github.io/oicq/#events */
            event: "message",
            priority: 5000,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: "^#我的便笺$",
                    /** 执行方法 */
                    fnc: "getAll",
                    permission: "all",
                },
                {
                    /** 命令正则匹配 */
                    reg: "^#检查树脂$",
                    /** 执行方法 */
                    fnc: "checkResin",
                    permission: "all",
                },
                {
                    /** 命令正则匹配 */
                    reg: "^#便笺帮助$",
                    /** 执行方法 */
                    fnc: "checkHelp",
                    permission: "all",
                },
                {
                    /** 命令正则匹配 */
                    reg: "^#开启自动检查$",
                    /** 执行方法 */
                    fnc: "startAutoCheck",
                    permission: "all",
                },
                {
                    /** 命令正则匹配 */
                    reg: "^#关闭自动检查$",
                    /** 执行方法 */
                    fnc: "stopAutoCheck",
                    permission: "all",
                }
            ],
            task: [
                {
                    name: "读取定时任务",
                    // cron: "*/15 * * * * ?",
                    cron: "0 0 * * * ?",
                    fnc: () => {
                        this.initAutoCheckTask()
                    },
                }
            ]
        })
    }

    randomString = (length, os = false) => {
        let randomStr = ''
        for (let i = 0; i < length; i++) {
            randomStr += lodash.sample(os ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' :
                'abcdefghijklmnopqrstuvwxyz0123456789')
        }
        return randomStr
    }

    mysSalt = "NjqtetBQOv7BxuOmK0vxzBDQfDXwDoJR" //k2 2.68.1
    DEVICE_ID = this.randomString(32).toUpperCase()
    DEVICE_NAME = this.randomString(lodash.random(1, 10))
    _path = process.cwd().replace(/\\/g, '/')
    gsUrl = 'https://api-takumi-record.mihoyo.com/game_record/genshin/aapi/widget/v2'

    getDs = (salt = this.mysSalt) => {
        const randomStr = this.randomString(6)
        const timestamp = Math.floor(Date.now() / 1000)
        let sign = md5(`salt=${salt}&t=${timestamp}&r=${randomStr}`)
        return `${timestamp},${randomStr},${sign}`
    }

    getHeader = (stoken) => {
        return {
            'Cookie': stoken,
            "x-rpc-channel": "miyousheluodi",
            'x-rpc-device_id': this.DEVICE_ID,
            'x-rpc-app_version': '2.68.1',
            "x-rpc-device_model": "Mi 10",
            'x-rpc-device_name': this.DEVICE_NAME,
            'x-rpc-client_type': '2',
            'x-rpc-verify_key': 'bll8iq97cem8',
            'x-rpc-device_fp': '38d7f0aac0ab7',
            "DS": this.getDs(),
            "Referer": "https://app.mihoyo.com",
            "x-rpc-sys_version": "12",
            //"Host": "api-takumi-record.mihoyo.com",
            "User-Agent": "okhttp/4.9.3",
        }
    }

    checkHelp() {
        this.reply(`便笺帮助：\n` +
            `[#便笺帮助]显示便笺相关命令列表\n` +
            `[#我的便笺]显示完整便笺（小组件）信息\n` +
            `[#检查树脂]检查当前树脂的数量是否超过警戒\n` +
            `[#开启自动检查]在每个整点自动检查树脂\n` +
            `[#关闭自动检查]关闭自动检查`)
    }

    /**
     * 通过xiaoyao-cvs获取stoken
     * 
     * @param {string} userId 用户ID
     * @param {string} uid 原神UID
     * @returns 
     */
    getStoken(userId, uid) {
        let file = `${this._path}/plugins/xiaoyao-cvs-plugin/data/yaml/${userId}.yaml`
        if (fs.existsSync(file)) {
            let ck = fs.readFileSync(file, 'utf-8')
            ck = YAML.parse(ck)
            if (ck[uid]) {
                return ck[uid]
            }
        }
        return {}
    }

    /**
     * 通过米游社桌面小组件获取原神相关信息
     * @param {String} stoken 米游社的有效cookie
     * @returns {Promise<{}> | Promise<{msg:String, data: object}>}
     */
    getInfo = (stoken) => {
        return new Promise((resolve, reject) => {
            axios.get(this.gsUrl, { headers: this.getHeader(stoken) }).then((res) => {
                return resolve(res.data)
            }).catch((err) => {
                return reject({
                    msg: "获取信息失败",
                    data: err
                })
            })
        })

    }

    /**
     * #我的便笺 执行函数，返回实时便笺信息
     */
    async getAll() {
        this.getWidget(this.e.user_id, this.e.user.getUid()).then(async (res) => {
            await this.reply(this.dateToString() + '\n' + this.widgetFormatter(res))
        }).catch((err) => {
            return this.reply(err)
        })
    }

    /**
     * 获取实时便笺数据
     * 
     * @param user_id 用户ID
     * @param uid 原神UID
     * @returns 
     */
    getWidget(user_id, uid) {
        return new Promise((resolve, reject) => {
            // 获取 sk
            const sk = this.getStoken(user_id, uid)
            const stoken = `stuid=${sk.stuid};stoken=${sk.stoken};mid=${sk.mid};`
            if (lodash.isEmpty(sk)) {
                reject(`未找到绑定的stoken，请先【#扫码登陆】绑定stoken或【#uid+序号】切换uid`)
            }

            this.getInfo(stoken).then((res) => {
                if (res.data.current_resin) {
                    resolve(res.data)
                } else {
                    reject(res.data)
                }
            }).catch((err) => {
                console.log(err)
                reject("获取信息失败，可能是stoken已过期，请重新绑定再尝试。")
            })
        })

    }

    /**
     * 格式化实时便笺内容
     * 
     * @param data getWidget方法返回的 res.data
     * @returns Formatter String
     */
    widgetFormatter(data) {
        let str = ""
        str += `UID为${this.e.user.getUid()} 的旅行者，您的实时便笺：\n`
        str += `原萃树脂：${data.current_resin}/${data.max_resin}\n`
        str += `每日委托奖励：${data.finished_task_num}/${data.total_task_num}\n`
        str += `委托奖励：${data.is_extra_task_reward_received ? "已领取" : "未领取"}\n`
        str += `探索派遣：已派出 ${data.current_expedition_num}/${data.max_expedition_num}\n`

        if (data.current_expedition_num != 0) {
            for (let i = 0; i < data.current_expedition_num; i++) {
                str += `派遣${i + 1}：${data.expeditions[i].status == "Finished" ? "已完成" : "未完成"}\n`
            }
        }
        str += `洞天宝钱：${data.current_home_coin}/${data.max_home_coin}`
        return str
    }

    /**
     * #检查树脂
     * 
     * @returns reply
     */
    checkResin() {
        this.getWidget(this.e.user_id, this.e.user.getUid()).then(async (res) => {
            if (res.current_resin > 160) {
                return this.reply(this.dateToString() + ` 旅行者，uid：${this.e.user.getUid()}，您当前的树脂为 ${res.current_resin}/${res.max_resin} ，已超过警戒值，请及时清理。`)
            } else {
                return this.reply(this.dateToString() + ` 旅行者，uid：${this.e.user.getUid()}您当前的树脂为 ${res.current_resin}/${res.max_resin} 尚未到达警戒值。`)
            }
        }).catch((err) => {
            return this.reply(err)
        })
    }

    dateToString() {
        const now = new Date()
        const time = {
            yyyy: now.getFullYear(),
            MM: (now.getMonth() + 1).toString().padStart(2, '0'),
            dd: (now.getDate()).toString().padStart(2, '0'),
            HH: (now.getHours()).toString().padStart(2, '0'),
            mm: (now.getMinutes()).toString().padStart(2, '0'),
            ss: (now.getSeconds()).toString().padStart(2, '0')
        }
        return `[${time.yyyy}-${time.MM}-${time.dd} ${time.HH}:${time.mm}:${time.ss}]`
    }

    /**
     * 定时任务执行主体
     * 
     * @param {string} user_id userID
     * @param {string} uid 原神UID
     * @returns 
     */
    async autoCheckResin(user_id, uid) {
        return new Promise((resolve, reject) => {
            this.getWidget(user_id, uid).then(async (res) => {
                if (res.current_resin > 160) {
                    resolve(`旅行者，uid: ${uid}，您当前的树脂为 ${res.current_resin}/${res.max_resin} ，请及时清理。`)
                }
            }).catch((err) => {
                reject(err)
            })
        })

    }

    /**
     * 检查树脂定时任务
     */
    initAutoCheckTask() {
        for (const item of config.user) {
            this.autoCheckResin(item.user_id, item.uid).then((res) => {
                if (item.group_id) {
                    Bot.sendGroupMsg(item.uin, item.group_id,
                        this.dateToString() + " " +
                        res)
                } else {
                    Bot.sendFriendMsg(item.uin, item.user_id)
                }
            }).catch(err => {
                console.log(err)
            })
        }
    }

    /**
     * #开启自动检测
     */
    async startAutoCheck() {
        if (!config.user.some(item => item.uid == this.e.user.getUid())) {
            config.user.push({
                user_id: this.e.user_id,
                uid: this.e.user.getUid(),
                uin: this.e.bot.uin,
                group_id: this.e.group ? this.e.group.group_id : null
            })
            await configSave()
            this.reply("已开启自动检查树脂，将在每个整点检查树脂，超过160将会进行提醒。请注意，提醒并不会进行@，请关注群消息。")
        } else {
            this.reply("您已经开启自动检查，不需要再次开启了。")
        }

    }

    /**
     * 关闭自动检测
     */
    async stopAutoCheck() {
        if (config.user.some(item => item.uid == this.e.user.getUid())) {
            config.user = config.user.filter(item => item.uid != this.e.user.getUid())
            await configSave()
            this.reply("自动检查树脂已关闭。")
        } else {
            this.reply("您没有开启自动检查。")
        }
    }
}

import { HttpsProxyAgent } from 'https-proxy-agent'
const proxyAgent = new HttpsProxyAgent('http://127.0.0.1:10809');
const API = [
    "https://kfc-crazy-thursday.vercel.app/api/index",
    "http://api.jixs.cc/api/wenan-fkxqs/index.php",
    "https://vme.im/api?format=text"
]
export class CrazyThursday extends plugin {
    constructor() {
        super({
            name: "疯狂星期四",
            dsc: "获取一条肯德基疯狂星期四文案",
            /** https://oicqjs.github.io/oicq/#events */
            event: "message",
            priority: 5000,
            rule: [
                {
                    /** 命令正则匹配 */
                    reg: "^#(?=KFC|kfc|疯狂星期四|(请我.*肯德基)|(.*肯德基.*疯狂星期四)|(v.*50)).*$",
                    /** 执行方法 */
                    fnc: "crazyThursday",
                    permission: "all",
                }
            ]
        })
    }

    getRandomElement() {
        const randomIndex = Math.floor(Math.random() * API.length);
        return API[randomIndex];
    }

    async crazyThursday() {

        axios.get(this.getRandomElement(), {
            httpAgent: proxyAgent,
            httpsAgent: proxyAgent
        })
            .then(res => {
                return this.reply(res.data)
            })
            .catch(err => {
                console.log(err)
                return this.reply("讨厌，我的文案被你掏空啦！")
            });
    }
}

logger.info(logger.green("- 米游社小组件插件 加载完成"))