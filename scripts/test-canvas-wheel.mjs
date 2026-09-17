import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scrollNodeWheel } from '../src/pages/canvas/TapnowStudio/nodeWheel.js'

function fixture() {
  const node = { parentElement:null, style:{}, clientHeight:400,scrollHeight:400 }
  const body = { parentElement:node, style:{overflowY:'auto',overflowX:'auto'}, clientHeight:300,scrollHeight:900,scrollTop:0,clientWidth:400,scrollWidth:900,scrollLeft:0 }
  const target = { parentElement:body,style:{},closest:()=>node }
  const canvas = {contains: value=>value===node}
  const event = {target,deltaY:80,deltaX:0,deltaMode:0,cancelable:true,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}}
  const run = () => scrollNodeWheel(event,canvas,element=>element.style)
  return {node,body,target,event,run}
}
test('custom-class description and generation bodies scroll without utility class matching',()=>{
  const {body,event,run}=fixture()
  assert.equal(run(),true); assert.equal(body.scrollTop,80); assert.equal(event.prevented,true)
})
test('scrollable textarea takes priority over its node',()=>{
  const {body,target,run}=fixture()
  Object.assign(target,{style:{overflowY:'auto'},clientHeight:100,scrollHeight:300,scrollTop:0})
  run(); assert.equal(target.scrollTop,80); assert.equal(body.scrollTop,0)
})
test('textarea at its boundary passes scrolling to the node body',()=>{
  const {body,target,run}=fixture()
  Object.assign(target,{style:{overflowY:'auto'},clientHeight:100,scrollHeight:300,scrollTop:200})
  run(); assert.equal(target.scrollTop,200); assert.equal(body.scrollTop,80)
})
test('outer node boundary consumes the wheel and prevents accidental canvas zoom',()=>{
  const {body,event,run}=fixture(); body.scrollTop=600
  assert.equal(run(),true); assert.equal(body.scrollTop,600); assert.equal(event.prevented,true)
})
test('upward wheel and line-mode deltas work',()=>{
  const {body,event,run}=fixture();body.scrollTop=300;event.deltaY=-3;event.deltaMode=1
  run();assert.equal(body.scrollTop,252)
})
test('horizontal gestures retain storyboard table scrolling',()=>{
  const {body,event,run}=fixture();event.deltaX=70;event.deltaY=0
  run();assert.equal(body.scrollLeft,70);assert.equal(body.scrollTop,0)
})
test('canvas background continues to use the zoom handler',()=>{
  const {event,run}=fixture();event.target={closest:()=>null}
  assert.equal(run(),false);assert.equal(event.prevented,undefined)
})
test('hidden overflowing elements are not mistaken for scroll areas',()=>{
  const {body,run}=fixture();body.style.overflowY='hidden'
  assert.equal(run(),false)
})
