import React, {Component} from 'react'
import {Button, Input, Table, Card, Tooltip} from 'antd'
import {QuestionCircleOutlined} from '@ant-design/icons'
import {actions, connect} from 'mirrorx'
import {globalConstants} from './globalConstants'
import './index.css'

const mapStateToProps = state => ({
    bossDmg: state.report.bossDmg,
    filteredBossDmg: state.report.filteredBossDmg,
    fight: state.report.fight,
    bossTrashDmg: state.report.bossTrashDmg,
    bossTrashSunderCasts: state.report.bossTrashSunderCasts,
    webWrapDebuff: state.report.webWrapDebuff,
    chainDebuff: state.report.chainDebuff,
    manaPotion: state.report.manaPotion,
    runes: state.report.runes,
    hunterAura: state.report.hunterAura,
})

class DashboardPage extends Component{

    constructor(props) {
        super(props)
        this.state={
            report: null,
            loading: false
        }
    }

    submit = () => {
        let promises = []
        this.setState({loading: true})

        promises.push(actions.report.getBOSSDmg(this.state.report))
        promises.push(actions.report.getFight(this.state.report))
        Promise.all(promises).then(()=>{
            promises = []
            const trashIds = this.findTargetIds(globalConstants.TRASHIDS, this.props.fight)
            const filteredBossIds = this.findTargetIds(globalConstants.BOSSIDS.filter(v => !globalConstants.REMOVEBOSSIDS.includes(v)), this.props.fight)
            const removedBossIds = this.findTargetIds(globalConstants.REMOVEBOSSIDS, this.props.fight)
            promises.push(actions.report.getBossTrashDmg({trashIds, reportId: this.state.report, removedBossIds}))
            promises.push(actions.report.getExcludedBossDmg({removedBossIds, reportId: this.state.report}))
            promises.push(actions.report.getManaPotion(this.state.report))
            promises.push(actions.report.getChainDebuff(this.state.report))
            promises.push(actions.report.getWebWrapDebuff(this.state.report))
            promises.push(actions.report.getRunes(this.state.report))
            promises.push(actions.report.getHunterbuff(this.state.report))
            promises.push(actions.report.getBossTrashSunderCasts({
                trashIds: trashIds.concat(filteredBossIds),
                reportId: this.state.report}))
            Promise.all(promises).then(()=>{
                this.setState({loading: false})
            })
        })
    }

    findTargetIds = (trashIds, fight) => {
        const enemies = fight?.enemies
        return enemies.map(enemy=>trashIds.includes(enemy.guid)&&enemy.id).filter(id=>!!id)
    }

    calculateBossTime = (fight) => {
        let sum = 0
        fight&&fight.fights.filter(record=>record.boss!==0).map(record=>{
            sum+=record.end_time-record.start_time
        })
        return sum/1000
    }

    calculatedSunderAvg = (sunderCasts) => {
        let sumWithoutTop4 = sunderCasts?.map(i=>i.sunder).sort((a,b)=>b-a).slice(4).reduce((sum, item)=>sum+item)
        let furyWarriorCounts = sunderCasts?.filter(item=> item.type ==='Warrior')?.length
        return Math.floor(sumWithoutTop4/(furyWarriorCounts-4)*0.7)
    }

    generateSource = () => {
        const {bossDmg, bossTrashDmg, bossTrashSunderCasts, manaPotion, runes, filteredBossDmg, hunterAura, chainDebuff, webWrapDebuff} = this.props
        let finalDmgMax = {}
        const sunderBase = this.calculatedSunderAvg(bossTrashSunderCasts)
        let source = bossDmg?.map(entry=>{
            const trashDmg = bossTrashDmg?.find(trashEntry=>trashEntry.id===entry.id)?.total
            const filteredBossDmgData = filteredBossDmg?.find(trashEntry=>trashEntry.id===entry.id)?.total
            const sunderCasts = bossTrashSunderCasts?.find(trashEntry=>trashEntry.id===entry.id)?.sunder
            const sunderPenalty = sunderCasts < sunderBase && entry.type==='Warrior' ? Math.floor(-0.05 * trashDmg) : 0
            const manaPotionCasts = manaPotion?.find(trashEntry=>trashEntry.id===entry.id)?.total || 0
            const runesCasts = runes?.find(trashEntry=>trashEntry.id===entry.id)?.runes
            const chainTime = Math.round(chainDebuff?.find(trashEntry=>trashEntry.id===entry.id)?.totalUptime/1000) || ''
            const webWrapTime = Math.round(webWrapDebuff?.find(trashEntry=>trashEntry.id===entry.id)?.totalUptime/1000) || ''
            const hunterAuraStatus = hunterAura?.find(trashEntry=>trashEntry.id===entry.id)?.totalUses>12 || hunterAura?.find(trashEntry=>trashEntry.id===entry.id)?.totalUptime>500000
            const hunterAuraPenalty = hunterAuraStatus && (entry.type==='Warrior'||entry.type==='Rogue') ? Math.floor(-0.015 * trashDmg) : 0
            const finalDamage = Number(trashDmg) + Number(sunderPenalty) + Number(hunterAuraPenalty)
            finalDmgMax[entry.type] = finalDmgMax[entry.type] > finalDamage ? finalDmgMax[entry.type] : finalDamage
            return {
                id: entry.id,
                name: entry.name,
                type: entry.type,
                bossDmg: entry.total,
                bossTrashDmg: trashDmg,
                sunderCasts,
                manaPotionCasts,
                runesCasts,
                filteredBossDmgData,
                sunderPenalty,
                hunterAuraPenalty,
                finalDamage,
                chainTime,
                webWrapTime
            }
        })

        source = source?.map(entry=>{
            entry.finalScore = (entry.finalDamage/finalDmgMax[entry.type]).toFixed(2)
            return entry
        })
        return source
    }

    render() {
        const sunderBase = this.calculatedSunderAvg(this.props.bossTrashSunderCasts)
        const dataSource =  this.generateSource()
        const columns = [
            {
                title: 'ID',
                dataIndex: 'name',
            },
            {
                title: '职业',
                dataIndex: 'type',
                filters: [
                    {
                        text: '战',
                        value: 'Warrior',
                    },
                    {
                        text: '法',
                        value: 'Mage',
                    },
                    {
                        text: '术',
                        value: 'Warlock',
                    },
                    {
                        text: '猎',
                        value: 'Hunter',
                    },
                    {
                        text: '贼',
                        value: 'Rogue',
                    },
                    {
                        text: '德',
                        value: 'Druid',
                    },
                    {
                        text: '牧',
                        value: 'Priest',
                    },
                    {
                        text: '骑',
                        value: 'Paladin',
                    },
                    {
                        text: '萨',
                        value: 'Shaman',
                    },

                ],
                onFilter: (value, record) => record.type === value ,
            },
            {
                title: 'Boss伤害',
                dataIndex: 'bossDmg',
                sorter: (a, b) => a.bossDmg-b.bossDmg,
            },
            {
                title: <Tooltip title="去除DK2, DK3，孢子男，电男的伤害">
                    <span>有效boss伤害<QuestionCircleOutlined /></span>
                </Tooltip>,
                dataIndex: 'filteredBossDmgData',
            },
            {
                title: '全程有效伤害',
                dataIndex: 'bossTrashDmg',
                sorter: (a, b) => a.bossTrashDmg-b.bossTrashDmg,
            },
            {
                title: <Tooltip title={`平均数的70%为: ${sunderBase}`}>
                    <span>战士有效破甲<QuestionCircleOutlined /></span>
                </Tooltip>,
                dataIndex: 'sunderCasts',
                render: (text,record)=> record.type ==='Warrior' ? text : '',
            },
            {
                title: <Tooltip title="扣5%有效伤害">
                    <span>破甲扣除<QuestionCircleOutlined /></span>
                </Tooltip>,
                dataIndex: 'sunderPenalty',
                render: text=> text !== 0 ? text : null,
            },
            {
                title: <Tooltip title="扣1.5%有效伤害">
                    <span>强击光环扣除<QuestionCircleOutlined /></span>
                </Tooltip>,
                dataIndex: 'hunterAuraPenalty',
                render: text=> text !== 0 ? text : null,
            },

            {
                title: '老克心控',
                children: [
                    {
                        title: '时间',
                        dataIndex: 'chainTime',
                    },
                    {
                        title: 'DPS',
                        dataIndex: 'chainTime',
                    },
                ]
            },

            {
                title:<Tooltip title="蜘蛛3上墙">
                    <span>蛛网裹体时间<QuestionCircleOutlined /></span>
                </Tooltip>,
                dataIndex: 'webWrapTime',
            },
            {
                title: '大蓝使用量',
                dataIndex: 'manaPotionCasts',
                sorter: (a, b) => a.manaPotionCasts-b.manaPotionCasts,
            },
            {
                title: '符文使用量',
                dataIndex: 'runesCasts',
                sorter: (a, b) => a.runesCasts-b.runesCasts,
            },
            {
                title: '总分数',
                dataIndex: 'finalDamage',
                sorter: (a, b) => a.finalDamage-b.finalDamage,
                defaultSortOrder: 'descend',
            },
            {
                title: '总百分比',
                dataIndex: 'finalScore',
            },
        ]
        return (
            <Card title={<div>
                <Input
                    style={{width: 400}}
                    placeholder="请粘贴reportID，例如: Jzx9tgnTKvVwAX"
                    onChange={event => this.setState({report: event.target.value})}/>
                <Button onClick={this.submit}>提交</Button>
            </div>}>
                <Table
                    rowClassName={record=>record.type}
                    size="small"
                    loading={this.state.loading}
                    dataSource={dataSource}
                    columns={columns}
                    rowKey='id'
                    pagination={false}
                />
            </Card>
        )
    }
}

export default connect(mapStateToProps, null) (DashboardPage)
