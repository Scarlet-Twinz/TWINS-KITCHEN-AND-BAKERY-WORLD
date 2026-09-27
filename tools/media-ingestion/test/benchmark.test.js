const test=require("node:test");
const assert=require("node:assert/strict");
const {evaluatePredictions}=require("../benchmark");

test("benchmark evaluator computes exact top1 and high-confidence precision",()=>{
  const cases=[
    {id:"1",productId:"60"},
    {id:"2",productId:"61"},
    {id:"3",productId:"62"}
  ];
  const result=evaluatePredictions(cases,[
    {id:"1",productId:"60",state:"HIGH"},
    {id:"2",productId:"61",state:"MEDIUM"},
    {id:"3",productId:"99",state:"HIGH"}
  ]);
  assert.equal(result.evaluated,3);
  assert.equal(result.top1Accuracy,2/3);
  assert.equal(result.highConfidencePrecision,1/2);
  assert.equal(result.falseHighCount,1);
});

test("benchmark evaluator measures unresolved rate",()=>{
  const result=evaluatePredictions(
    [{id:"1",productId:"60"},{id:"2",productId:"61"}],
    [{id:"1",state:"UNRESOLVED"},{id:"2",productId:"61",state:"MEDIUM"}]
  );
  assert.equal(result.unresolvedRate,0.5);
});
