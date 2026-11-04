const $ = (s) => document.querySelector(s),
  W = 1000,
  H = 700;
const scene = $("#scene"),
  ctx = scene.getContext("2d"),
  paint = $("#paint"),
  pc = paint.getContext("2d");
const layer = () => {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
};
const base = layer(),
  mask = layer(),
  result = layer(),
  tex = layer(),
  tint = layer();
const bc = base.getContext("2d"),
  mc = mask.getContext("2d"),
  rc = result.getContext("2d"),
  tc = tex.getContext("2d"),
  ic = tint.getContext("2d");
const mats = [
  ["燕麦白", "#c7bc9e", "linen", "L-01"],
  ["砂岩米", "#b8a182", "linen", "L-02"],
  ["苔原绿", "#687866", "linen", "L-03"],
  ["陶土棕", "#a66a51", "linen", "L-04"],
  ["雾霭灰", "#8c9290", "velvet", "V-01"],
  ["深海蓝", "#526574", "velvet", "V-02"],
  ["焦糖棕", "#986347", "leather", "P-01"],
  ["夜幕黑", "#414440", "leather", "P-02"],
];
let aiCanvas = null;
let material = { ...matObj(mats[2]) },
  view = "result",
  tool = "",
  drawing = false,
  last = null,
  history = [],
  schemes = [],
  isDemo = true,
  maskPresent = true;
function matObj(m) {
  return {
    name:
      m[0] + " · " + { linen: "棉麻", velvet: "绒布", leather: "皮革" }[m[2]],
    color: m[1],
    type: m[2],
    code: m[3],
    image: null,
  };
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(window.toastTime);
  window.toastTime = setTimeout(
    () => $("#toast").classList.remove("show"),
    3000,
  );
}
function rr(c, x, y, w, h, r, color) {
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}
function grad(x, y, x2, y2, a, b) {
  const g = bc.createLinearGradient(x, y, x2, y2);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}
function sofaPiece(x, y, w, h, r, a, b) {
  rr(bc, x, y, w, h, r, grad(x, y, x + w, y + h, a, b));
  rr(mc, x, y, w, h, r, "#fff");
  bc.strokeStyle = "#7b77642c";
  bc.lineWidth = 1.3;
  bc.beginPath();
  bc.roundRect(x + 3, y + 3, w - 6, h - 6, r);
  bc.stroke();
}
function demo() {
  aiCanvas = null;
  window.resetAISelection?.();
  isDemo = true;
  history = [];
  maskPresent = true;
  mc.clearRect(0, 0, W, H);
  bc.clearRect(0, 0, W, H);
  bc.fillStyle = grad(0, 0, W, H, "#eeebe3", "#dedcd2");
  bc.fillRect(0, 0, W, H);
  // Architectural backdrop, sun and rug.
  bc.fillStyle = "#d7d3c8";
  bc.fillRect(0, 487, W, 213);
  bc.fillStyle = "#bfbcae66";
  bc.fillRect(0, 485, W, 2);
  bc.fillStyle = "#f8f5e799";
  bc.beginPath();
  bc.moveTo(0, 0);
  bc.lineTo(340, 0);
  bc.lineTo(600, 486);
  bc.lineTo(290, 486);
  bc.fill();
  rr(bc, 690, 72, 170, 229, 2, "#c6beac");
  rr(bc, 699, 81, 152, 211, 0, "#f7f4eb");
  bc.fillStyle = "#bdad97";
  bc.beginPath();
  bc.arc(775, 180, 52, Math.PI, 0);
  bc.lineTo(827, 263);
  bc.lineTo(723, 263);
  bc.fill();
  bc.fillStyle = "#eeebe1";
  bc.fillRect(767, 118, 9, 147);
  bc.save();
  bc.translate(510, 548);
  bc.scale(1, 0.23);
  bc.fillStyle = "#ebe5d7";
  bc.beginPath();
  bc.ellipse(0, 0, 397, 210, 0, 0, Math.PI * 2);
  bc.fill();
  bc.strokeStyle = "#d9d1c0";
  bc.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    bc.beginPath();
    bc.ellipse(0, 0, 380 - i * 6, 194 - i * 5, 0, 0, Math.PI * 2);
    bc.stroke();
  }
  bc.restore();
  bc.save();
  bc.filter = "blur(15px)";
  bc.fillStyle = "#504e4445";
  bc.beginPath();
  bc.ellipse(475, 536, 315, 28, 0, 0, Math.PI * 2);
  bc.fill();
  bc.restore();
  rr(bc, 211, 492, 14, 59, 3, "#655c4c");
  rr(bc, 736, 492, 14, 59, 3, "#655c4c");
  sofaPiece(188, 284, 591, 213, 38, "#d0c7b3", "#8f8a78");
  sofaPiece(180, 432, 605, 87, 20, "#c7beaa", "#999480");
  sofaPiece(209, 281, 174, 164, 23, "#e0d7c4", "#b0a994");
  sofaPiece(386, 277, 177, 169, 23, "#dfd6c3", "#afa893");
  sofaPiece(566, 281, 174, 164, 23, "#dad1be", "#aca58f");
  sofaPiece(208, 422, 174, 64, 16, "#d8ceba", "#aaa28e");
  sofaPiece(386, 423, 177, 64, 16, "#d9cfbb", "#a69f8b");
  sofaPiece(566, 423, 177, 64, 16, "#d4cab6", "#a39c88");
  sofaPiece(156, 373, 77, 141, 24, "#d9d1bd", "#aaa38f");
  sofaPiece(731, 373, 77, 141, 24, "#d6cdba", "#a29c87");
  // Low side table and sculptural vase.
  bc.fillStyle = "#8b7b62";
  bc.fillRect(863, 458, 8, 84);
  bc.fillRect(929, 458, 8, 84);
  rr(bc, 841, 447, 116, 13, 6, "#a99578");
  bc.fillStyle = "#ba9d7d";
  bc.beginPath();
  bc.moveTo(885, 446);
  bc.bezierCurveTo(865, 408, 881, 395, 886, 386);
  bc.lineTo(884, 373);
  bc.lineTo(906, 373);
  bc.lineTo(904, 386);
  bc.bezierCurveTo(925, 411, 922, 433, 908, 446);
  bc.fill();
  bc.strokeStyle = "#737b5d";
  bc.lineWidth = 3;
  bc.beginPath();
  bc.moveTo(895, 378);
  bc.quadraticCurveTo(876, 325, 903, 287);
  bc.moveTo(894, 350);
  bc.quadraticCurveTo(927, 328, 926, 305);
  bc.stroke();
  bc.fillStyle = "#7d8565";
  [
    [891, 326],
    [901, 299],
    [919, 320],
  ].forEach(([x, y]) => {
    bc.beginPath();
    bc.ellipse(x, y, 6, 17, -0.6, 0, 7);
    bc.fill();
  });
  $("#imageName").textContent = "当前：示例三人沙发（插画）";
  $("#instruction").textContent =
    "示例已选中沙发表面，点击左侧布料即可预览。上传自己的照片后，请先涂选需要换材质的区域。";
  setTool("");
  render();
}
function buildTexture() {
  tc.clearRect(0, 0, W, H);
  tc.fillStyle = material.color;
  tc.fillRect(0, 0, W, H);
  const scale = +$("#scale").value / 100;
  if (material.image) {
    const im = material.image;
    const tw = Math.max(35, Math.min(350, im.width * 0.3) * scale),
      th = (tw * im.height) / im.width;
    for (let y = 0; y < H; y += th)
      for (let x = 0; x < W; x += tw) tc.drawImage(im, x, y, tw, th);
    return;
  }
  let seed = 42;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const step = (material.type === "leather" ? 3 : 2) * scale;
  tc.lineWidth = Math.max(0.4, scale * 0.7);
  for (let y = 0; y < H; y += step) {
    tc.strokeStyle = y % (step * 2) < step ? "#ffffff16" : "#00000012";
    tc.beginPath();
    tc.moveTo(0, y);
    tc.lineTo(W, y + rand() * 2);
    tc.stroke();
  }
  for (let x = 0; x < W; x += step) {
    tc.strokeStyle = "#ffffff12";
    tc.beginPath();
    tc.moveTo(x, 0);
    tc.lineTo(x, H);
    tc.stroke();
  }
  for (let i = 0; i < 16000; i++) {
    tc.fillStyle = rand() > 0.5 ? "#ffffff16" : "#00000012";
    let x = rand() * W,
      y = rand() * H;
    tc.fillRect(x, y, material.type === "leather" ? 2 : 1, 1);
  }
}
function render(rebuild = true) {
  if (rebuild) buildTexture();
  rc.globalCompositeOperation = "source-over";
  rc.clearRect(0, 0, W, H);
  rc.drawImage(base, 0, 0);
  ic.clearRect(0, 0, W, H);
  ic.globalCompositeOperation = "source-over";
  ic.drawImage(tex, 0, 0);
  ic.globalCompositeOperation = "multiply";
  ic.drawImage(base, 0, 0);
  ic.globalCompositeOperation = "destination-in";
  ic.drawImage(mask, 0, 0);
  ic.globalCompositeOperation = "source-over";
  rc.globalAlpha = +$("#strength").value / 100;
  rc.drawImage(tint, 0, 0);
  rc.globalAlpha = 1;
  if (aiCanvas) {
    rc.clearRect(0, 0, W, H);
    rc.drawImage(aiCanvas, 0, 0, W, H);
  }
  drawView();
  drawMask();
  if ($("#modeBadge"))
    $("#modeBadge").textContent = aiCanvas ? "AI 生成效果" : "本地预览";
}
function drawView() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(view === "original" ? base : result, 0, 0);
  if (view === "compare") {
    let x = (W * $("#compare").value) / 100;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, x, H);
    ctx.clip();
    ctx.drawImage(base, 0, 0);
    ctx.restore();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, H / 2, 19, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#526346";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("↔", x, H / 2 + 6);
  }
  $("#canvasTag").textContent =
    view === "original" ? "原始家具" : material.name;
}
function drawMask() {
  pc.clearRect(0, 0, W, H);
  if (tool) {
    pc.drawImage(mask, 0, 0);
    pc.globalCompositeOperation = "source-in";
    pc.fillStyle = "#6c9c7a66";
    pc.fillRect(0, 0, W, H);
    pc.globalCompositeOperation = "source-over";
  }
}
function setTool(t) {
  tool = t;
  paint.style.pointerEvents = t ? "auto" : "none";
  paint.style.cursor = t ? "crosshair" : "default";
  $("#brush").classList.toggle("on", t === "brush");
  $("#erase").classList.toggle("on", t === "erase");
  if (t && view === "original") setView("result");
  drawMask();
}
function setView(v) {
  view = v;
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $("#compareBar").hidden = v !== "compare";
  drawView();
}
function pushHistory() {
  history.push(mc.getImageData(0, 0, W, H));
  if (history.length > 12) history.shift();
}
function point(e) {
  let r = paint.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * W) / r.width,
    y: ((e.clientY - r.top) * H) / r.height,
  };
}
function stroke(p) {
  aiCanvas = null;
  window.aiSelectionChanged?.();
  mc.globalCompositeOperation =
    tool === "erase" ? "destination-out" : "source-over";
  mc.strokeStyle = "#fff";
  mc.lineWidth = +$("#brushSize").value;
  mc.lineCap = "round";
  mc.lineJoin = "round";
  mc.beginPath();
  mc.moveTo(last.x, last.y);
  mc.lineTo(p.x + 0.01, p.y + 0.01);
  mc.stroke();
  mc.globalCompositeOperation = "source-over";
  last = p;
  maskPresent = true;
  render(false);
}
paint.onpointerdown = (e) => {
  if (!tool) return;
  pushHistory();
  drawing = true;
  paint.setPointerCapture(e.pointerId);
  last = point(e);
  stroke(last);
};
paint.onpointermove = (e) => {
  if (drawing) stroke(point(e));
};
paint.onpointerup = paint.onpointercancel = () => {
  drawing = false;
};
function choose(m) {
  aiCanvas = null;
  window.aiMaterialChanged?.();
  material = { ...m };
  $("#matName").textContent = m.name;
  $("#matCode").textContent = m.code || "CUSTOM MATERIAL";
  $("#sample").style.background = m.color;
  $("#sample").style.backgroundImage = m.image
    ? "url(" + m.image.src + ")"
    : "";
  $("#sample").style.backgroundSize = "cover";
  $("#color").value = m.color;
  document
    .querySelectorAll(".swatch")
    .forEach((b) => b.classList.toggle("on", b.dataset.code === m.code));
  render();
}
function swatches(f = "all") {
  $("#swatches").replaceChildren();
  mats
    .filter((m) => f === "all" || m[2] === f)
    .forEach((m) => {
      let b = document.createElement("button");
      b.className = "swatch" + (m[3] === material.code ? " on" : "");
      b.dataset.code = m[3];
      b.innerHTML = "<i></i><span></span>";
      b.querySelector("i").style.backgroundColor = m[1];
      b.querySelector("span").textContent = m[0];
      b.onclick = () => choose(matObj(m));
      $("#swatches").append(b);
    });
}
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-filter]")
        .forEach((v) => v.classList.toggle("on", v === b));
      swatches(b.dataset.filter);
    }),
);
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#compare").oninput = drawView;
$("#brush").onclick = () => setTool(tool === "brush" ? "" : "brush");
$("#erase").onclick = () => setTool(tool === "erase" ? "" : "erase");
$("#undo").onclick = () => {
  aiCanvas = null;
  window.aiSelectionChanged?.();
  if (!history.length) return toast("还没有可以撤销的操作");
  mc.putImageData(history.pop(), 0, 0);
  render(false);
};
$("#clear").onclick = () => {
  aiCanvas = null;
  window.resetAISelection?.();
  pushHistory();
  mc.clearRect(0, 0, W, H);
  maskPresent = false;
  render(false);
  toast("已清空，点击「涂选区域」重新选择");
};
$("#demo").onclick = () => {
  demo();
  toast("已恢复示例沙发");
};
for (let id of ["scale", "strength"])
  $("#" + id).oninput = () => {
    aiCanvas = null;
    window.aiMaterialChanged?.();
    $("#" + id + "Out").textContent = $("#" + id).value + "%";
    render(id === "scale");
  };
$("#color").oninput = (e) =>
  choose({
    name: "自定义纯色",
    color: e.target.value,
    type: "solid",
    code: "CUSTOM COLOR",
    image: null,
  });
function loadFile(input, callback) {
  const f = input.files[0];
  if (!f) return;
  if (f.size > 15 * 1024 * 1024) {
    input.value = "";
    return toast("请选择小于 15 MB 的图片");
  }
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
    input.value = "";
    return toast("请选择 JPG、PNG 或 WebP 图片");
  }
  const reader = new FileReader();
  reader.onload = () => {
    const im = new Image();
    im.onload = () => {
      if (im.width * im.height > 50000000) {
        input.value = "";
        return toast("图片像素过大，请压缩后再试");
      }
      callback(im, f.name);
      input.value = "";
    };
    im.onerror = () => toast("图片无法读取，请换一张图片");
    im.src = reader.result;
  };
  reader.onerror = () => toast("文件读取失败，请重试");
  reader.readAsDataURL(f);
}
$("#furniture").onchange = (e) =>
  loadFile(e.target, (im, name) => {
    aiCanvas = null;
    window.resetAISelection?.();
    isDemo = false;
    history = [];
    maskPresent = false;
    bc.fillStyle = "#e9e7df";
    bc.fillRect(0, 0, W, H);
    let k = Math.min(W / im.width, H / im.height);
    bc.drawImage(
      im,
      (W - im.width * k) / 2,
      (H - im.height * k) / 2,
      im.width * k,
      im.height * k,
    );
    mc.clearRect(0, 0, W, H);
    $("#imageName").textContent = "当前：" + name;
    $("#instruction").textContent =
      "在照片上涂选需要换布的表面。绿色标记是选区提示，退出「涂选区域」后查看效果。";
    setTool("brush");
    render();
    toast("家具已载入，请涂选要换材质的区域");
  });
$("#fabric").onchange = (e) =>
  loadFile(e.target, (im, name) => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    let cctx = c.getContext("2d");
    cctx.drawImage(im, 0, 0, 1, 1);
    let d = cctx.getImageData(0, 0, 1, 1).data;
    let color =
      "#" +
      [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, "0")).join("");
    choose({
      name: name.replace(/\.[^.]+$/, "").slice(0, 24),
      color,
      type: "custom",
      code: "UPLOADED FABRIC",
      image: im,
    });
    toast("布料已载入，建议调整纹理大小");
  });
$("#export").onclick = () => {
  const a = document.createElement("a");
  a.download =
    "织间-" +
    material.name +
    "-" +
    (view === "compare" ? "对比" : "预览") +
    ".png";
  a.href = scene.toDataURL("image/png");
  a.click();
  toast("效果图已导出（不含选区标记）");
};
$("#save").onclick = () => {
  if (schemes.length >= 6) return toast("最多保存 6 个搭配，请先移除一个");
  const saved = {
    id: Date.now(),
    material: { ...material },
    scale: $("#scale").value,
    strength: $("#strength").value,
    base: layer(),
    mask: layer(),
    thumb: result.toDataURL("image/jpeg", 0.65),
    label: $("#imageName").textContent,
    isDemo,
  };
  saved.base.getContext("2d").drawImage(base, 0, 0);
  saved.mask.getContext("2d").drawImage(mask, 0, 0);
  saved.aiCanvas = aiCanvas ? layer() : null;
  if (saved.aiCanvas) saved.aiCanvas.getContext("2d").drawImage(aiCanvas, 0, 0);
  schemes.push(saved);
  drawSchemes();
  toast("已保存在本次会话，关闭页面后清除");
};
function drawSchemes() {
  $("#schemes").replaceChildren();
  if (!schemes.length) {
    $("#schemes").innerHTML =
      '<div class="empty-schemes">你的下一种灵感，从这里开始。<span>保存后可随时切换 · 本次打开期间有效</span></div>';
    return;
  }
  schemes.forEach((s) => {
    const c = document.createElement("div");
    c.className = "scheme";
    const im = document.createElement("img");
    im.src = s.thumb;
    im.alt = s.material.name;
    const apply = document.createElement("button");
    apply.className = "apply";
    apply.textContent = s.material.name;
    apply.onclick = () => {
      bc.clearRect(0, 0, W, H);
      bc.drawImage(s.base, 0, 0);
      mc.clearRect(0, 0, W, H);
      mc.drawImage(s.mask, 0, 0);
      $("#scale").value = s.scale;
      $("#strength").value = s.strength;
      $("#scaleOut").textContent = s.scale + "%";
      $("#strengthOut").textContent = s.strength + "%";
      $("#imageName").textContent = s.label;
      isDemo = s.isDemo;
      history = [];
      setTool("");
      setView("result");
      choose(s.material);
      aiCanvas = s.aiCanvas;
      window.resetAISelection?.();
      render(false);
      toast("已恢复搭配和家具选区");
    };
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "移除此搭配");
    remove.onclick = () => {
      schemes = schemes.filter((v) => v.id !== s.id);
      drawSchemes();
    };
    c.append(im, apply, remove);
    $("#schemes").append(c);
  });
}
$("#help").onclick = () => $("#guide").showModal();
$("#closeGuide").onclick = () => $("#guide").close();
$("#guide").onclick = (e) => {
  if (e.target === $("#guide")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
};
swatches();
demo();
choose(material);
