const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

function loadTypeScriptModule(path, requireMap = {}) {
  const sandbox = {
    exports: {},
    require: id => {
      if (Object.prototype.hasOwnProperty.call(requireMap, id)) return requireMap[id];
      throw new Error(`Unexpected require: ${id}`);
    },
  };
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, sandbox, { filename: path });
  return sandbox.exports;
}

const split = loadTypeScriptModule("lib/image-grid-split.ts");
const expected = {
  2: { rows: 1, cols: 2 },
  4: { rows: 2, cols: 2 },
  6: { rows: 3, cols: 2 },
  9: { rows: 3, cols: 3 },
};

for (const [countText, layout] of Object.entries(expected)) {
  const count = Number(countText);
  assert.deepEqual({ ...split.getImageGridLayout(count) }, layout, `${count} image layout`);
  assert.equal(split.isImageGridCount(count), true, `${count} supported count`);
  assert.equal(split.describeImageGridLayout(layout), `${layout.rows} 行 × ${layout.cols} 列`);

  const width = 1200;
  const height = 1200;
  const rects = split.getImageGridCropRects(width, height, layout);
  assert.equal(rects.length, count, `${count} image crop count`);
  rects.forEach((rect, index) => {
    const row = Math.floor(index / layout.cols);
    const col = index % layout.cols;
    const cellLeft = Math.round((width * col) / layout.cols);
    const cellTop = Math.round((height * row) / layout.rows);
    const cellRight = Math.round((width * (col + 1)) / layout.cols);
    const cellBottom = Math.round((height * (row + 1)) / layout.rows);
    assert.equal(rect.row, row, `${count} image row ${index}`);
    assert.equal(rect.col, col, `${count} image col ${index}`);
    assert.ok(rect.x >= cellLeft && rect.x + rect.width <= cellRight, `${count} image x bounds ${index}`);
    assert.ok(rect.y >= cellTop && rect.y + rect.height <= cellBottom, `${count} image y bounds ${index}`);
    const portraitRect = split.fitImageGridCropRectToAspectRatio(rect, 0.84);
    assert.ok(portraitRect.x >= rect.x && portraitRect.x + portraitRect.width <= rect.x + rect.width, `${count} portrait x bounds ${index}`);
    assert.ok(portraitRect.y >= rect.y && portraitRect.y + portraitRect.height <= rect.y + rect.height, `${count} portrait y bounds ${index}`);
    assert.ok(Math.abs(portraitRect.width / portraitRect.height - 0.84) < 0.01, `${count} portrait ratio ${index}`);
  });
}
assert.equal(split.isImageGridCount(3), false, "3 is not a supported group count");

const protocol = loadTypeScriptModule("lib/image-delivery-protocol.ts", {
  "./image-grid-split": split,
});
const sixPlan = protocol.createPhotoGroupPlan(6, "同一个角色在六个不同瞬间拍下的独立照片");
const sixPrompt = protocol.buildMultiImageSheetPrompt(sixPlan);
assert.deepEqual({ ...sixPrompt.layout }, { rows: 3, cols: 2 });
assert.equal(sixPrompt.canvasGuidance.targetCellAspectRatio, 0.84);
assert.ok(Math.abs(sixPrompt.canvasGuidance.idealCanvasAspectRatio - 0.56) < 0.001);
assert.equal(sixPrompt.canvasGuidance.orientation, "portrait");
assert.match(sixPrompt.prompt, /严格分为 3 行，每行 2 张/);
assert.match(sixPrompt.prompt, /不得交换行列/);
assert.match(sixPrompt.prompt, /格子内部不得再出现拼贴/);
assert.match(sixPrompt.prompt, /活泼外放的人物鼓励更丰富的表情和动作变化/);
assert.match(sixPrompt.prompt, /每个格子最终会作为上下方向较长的纵向照片/);
assert.equal(protocol.resolveMultiImageGenerationSize(sixPrompt.canvasGuidance, { model: "gpt-image-2", configuredSize: "1024x1024" }).size, "1024x1536");
assert.equal(protocol.resolveMultiImageGenerationSize(sixPrompt.canvasGuidance, { model: "dall-e-3", configuredSize: "1024x1024" }).size, "1024x1792");
const twoPrompt = protocol.buildMultiImageSheetPrompt(protocol.createPhotoGroupPlan(2, "两张纵向自拍"));
assert.equal(protocol.resolveMultiImageGenerationSize(twoPrompt.canvasGuidance, { model: "gpt-image-2", configuredSize: "1024x1024" }).size, "1536x1024");
assert.equal(protocol.resolveMultiImageGenerationSize(sixPrompt.canvasGuidance, { model: "unknown-image", configuredSize: "768x1344" }).size, "768x1344");
const subtlePrompt = protocol.buildMultiImageSheetPrompt(protocol.createPhotoGroupPlan(2, "内敛角色的两个日常瞬间", [], "subtle"));
assert.match(subtlePrompt.prompt, /不强迫夸张表演/);
assert.match(protocol.IMAGE_DELIVERY_DECISION_PROTOCOL, /最终应出现几个可独立浏览的媒体对象/);
assert.match(protocol.IMAGE_DELIVERY_DECISION_PROTOCOL, /不得依赖某个关键词或穷举例外/);
assert.equal(protocol.resolveImageExecutionMode(true), "generated_photo");
assert.equal(protocol.resolveImageExecutionMode(false), "text_photo");
assert.throws(() => protocol.createPhotoGroupPlan(3, "三张照片"), /只支持 2、4、6、9/);

console.log("PASS: 2/4/6/9 layouts, crop bounds, and delivery protocol are consistent.");
