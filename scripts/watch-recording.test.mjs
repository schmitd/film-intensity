// Execute the selected Monkey C method bodies with small host stubs.
// This is a source-bound control-flow regression, not a Garmin compiler/device test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source = readFileSync(new URL('../apps/watch/source/SessionManager.mc', import.meta.url),'utf8');
function body(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const open = source.indexOf('{', start);
  let depth=1, end=open+1;
  while(depth) { const c=source[end++]; if(c==='{') depth++; if(c==='}') depth--; }
  return source.slice(open+1,end-1).replace(/method\(:(\w+)\)/g,'"$1"').replace(/\.size\(\)/g,'.length').replace(/\.add\(/g,'.push(');
}
function rig() {
  const state = { _phase:'RECORDING', _completionRequested:false, _requestInFlight:false,
    _sessionId:'session', _deviceToken:'token', _deviceId:'watch', _uploadBatchSize:30,
    _uploadBatchThreshold:24, _nextUploadAttemptAt:0, samples:0, requests:0, stops:0, completions:0, queued:24,
    _buffer:{queuedCount:()=>state.queued,takeBatch:()=>{state.queued=0;return Array(24).fill({});},prependSamples(rows){state.queued+=rows.length;},markUploaded(){}},
    WatchUi:{requestUpdate(){}}, persistUploadState(){}, stopSensorCapture(){state.stops++;},
    scheduleUploadRetry(){}, uploadRetryReady:()=>true, captureSample(){state.samples++;},
    _api:{uploadBatch(){state.requests++;}}, requestCompletion(){state.completions++;}
  };
  const context = vm.createContext(state);
  for(const name of ['onTick','flushUpload','finishRecording']) {
    state[name]=()=>vm.runInContext(`(function(){${body(name)}})()`,context);
  }
  state.onBatchUploaded=(responseCode,data)=>{state.responseCode=responseCode;state.data=data;return vm.runInContext(`(function(){${body('onBatchUploaded')}})()`,context);};
  return state;
}
test('live upload does not pause subsequent sensor ticks or duplicate requests',()=>{
  const s=rig(); s.onTick(); assert.equal(s.requests,1); assert.equal(s._phase,'RECORDING');
  s.onTick(); s.onTick(); assert.equal(s.samples,3); assert.equal(s.requests,1);
});
test('SELECT stop during in-flight upload still stops capture and requests completion',()=>{
  const s=rig(); s.onTick(); s.finishRecording();
  assert.equal(s._phase,'UPLOADING'); assert.equal(s._completionRequested,true); assert.equal(s.stops,1);
  s.onTick(); assert.equal(s.samples,1); assert.equal(s.requests,1);
});
test('post-recording queued upload stays in UPLOADING without capture',()=>{
  const s=rig(); s._phase='UPLOADING'; s._completionRequested=true;
  s.onTick(); assert.equal(s.samples,0); assert.equal(s.requests,1); assert.equal(s._phase,'UPLOADING');
});

test('failed live upload resumes recording and leaves future ticks enabled',()=>{
  const s=rig();s.onTick();s.onBatchUploaded(503,null);assert.equal(s._phase,'RECORDING');assert.equal(s._requestInFlight,false);s.onTick();assert.equal(s.samples,2);
});
test('successful live upload retains recording after acceptance',()=>{
  const s=rig();s.onTick();s.onBatchUploaded(200,{acceptedSamples:24});assert.equal(s._phase,'RECORDING');assert.equal(s._pendingBatch,null);assert.equal(s._requestInFlight,false);
});

test('successful callback after explicit stop closes drained session',()=>{
  const s=rig();s.onTick();s.finishRecording();s.onBatchUploaded(200,{acceptedSamples:24});
  assert.equal(s.stops,1);assert.equal(s.completions,1);assert.equal(s.samples,1);
});
test('failed callback after stop queues retry without restarting capture',()=>{
  const s=rig();s.onTick();s.finishRecording();s.onBatchUploaded(503,null);
  assert.equal(s._phase,'UPLOADING');assert.equal(s.queued,24);assert.equal(s.completions,0);
  s.onTick();assert.equal(s.samples,1);assert.equal(s.requests,2);
});
