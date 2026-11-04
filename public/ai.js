let serverConfigured = false,
  aiParts = [],
  pendingTask = null,
  aiBusy = false,
  selectionEdited = false;
const aiStatus = (message, error = false) => {
  $("#aiStatus").textContent = message;
  $("#aiStatus").classList.toggle("error", error);
};
const imageData = (c) => c.toDataURL("image/jpeg", 0.9);
function updateEstimate() {
  const m = $("#imageModel").value;
  const p = m === "qwen-image-3.0-pro" ? 0.03572 : 0.02535;
  $("#estimate").textContent =
    "单张约 $" + (p + 0.00286 * 3).toFixed(3) + " + 识别费";
}
function updateConnection() {
  $("#aiConnection").textContent = serverConfigured
    ? "后台 AI 已配置"
    : "后台 AI 未配置";
  $("#serverKeyStatus").textContent = serverConfigured
    ? "后台密钥已配置，可开始识别与生成。"
    : "后台尚未配置 AI 服务，请在本地 .dev.vars 设置 AIHUBMIX_API_KEY 后重启服务。";
}
function needKey() {
  if (serverConfigured) return true;
  aiStatus(
    "后台 AI 服务尚未配置。请在项目 .dev.vars 填入 AIHUBMIX_API_KEY，然后重启服务。",
    true,
  );
  return false;
}
function setBusy(b) {
  aiBusy = b;
  document.body.classList.toggle("busy", b);
  document
    .querySelectorAll("main button,main input,main select,#aiSettings")
    .forEach((el) => {
      if (b) {
        el.dataset.wasDisabled = el.disabled ? "1" : "0";
        el.disabled = true;
      } else {
        el.disabled = el.dataset.wasDisabled === "1";
        delete el.dataset.wasDisabled;
      }
    });
}
async function callAI(path, payload) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(185000),
  });
  if (!r.ok) {
    let d;
    try {
      d = await r.json();
    } catch {}
    const error = new Error(
      d?.error || "请求失败，请检查网络或 AiHubMix 控制台。",
    );
    error.retryable = [502, 503, 504].includes(r.status);
    throw error;
  }
  return path === "result" ? r.blob() : r.json();
}
async function readTask(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callAI("task", { id });
    } catch (error) {
      const transient =
        error.retryable ||
        error.name === "TimeoutError" ||
        error.message === "Failed to fetch";
      if (!transient || attempt === 2) throw error;
      aiStatus("任务已提交，正在重新读取状态（不会重复生成）…");
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}
function friendlyError(e) {
  return e.name === "TimeoutError"
    ? "请求超时，模型可能仍在生成。请先检查 AiHubMix 控制台，避免重复付费。"
    : e.message === "Failed to fetch"
      ? "网络中断。生成可能已受理，请先检查 AiHubMix 控制台，勿立即重复提交。"
      : e.message;
}
window.resetAISelection = () => {
  aiParts = [];
  selectionEdited = false;
  if ($("#partsPanel")) {
    $("#partsPanel").hidden = true;
    $("#partsList").replaceChildren();
  }
  if (!aiBusy)
    aiStatus("家具或选区已更新。可重新识别部件，或直接用手动选区生成。");
};
window.aiSelectionChanged = () => {
  selectionEdited = true;
  if (!aiBusy) aiStatus("选区已手动修正；生成时将以当前红色参考区域为准。");
};
window.aiMaterialChanged = () => {
  if (!aiBusy)
    aiStatus("材质已更新。当前为本地预览，点击「生成 AI 效果」生成新搭配。");
};
function applyParts() {
  pushHistory();
  mc.clearRect(0, 0, W, H);
  aiCanvas = null;
  for (const p of aiParts.filter((p) => p.selected)) {
    mc.beginPath();
    p.polygon.forEach(([x, y], i) => {
      const px = (x / 1000) * W,
        py = (y / 1000) * H;
      i ? mc.lineTo(px, py) : mc.moveTo(px, py);
    });
    mc.closePath();
    mc.fillStyle = "#fff";
    mc.fill();
  }
  selectionEdited = false;
  maskPresent = aiParts.some((p) => p.selected);
  setTool("brush");
  render(false);
  if (!aiBusy) aiStatus("选区已更新，当前为本地预览。请生成新的 AI 效果。");
}
function showParts() {
  $("#partsPanel").hidden = false;
  $("#partsList").replaceChildren();
  for (const p of aiParts) {
    const label = document.createElement("label");
    label.className = "part-chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = p.selected;
    input.onchange = () => {
      p.selected = input.checked;
      applyParts();
    };
    const span = document.createElement("span");
    span.textContent = p.label;
    label.append(input, span);
    $("#partsList").append(label);
  }
}
async function analyze() {
  if (aiBusy || !needKey()) return;
  if (pendingTask)
    return aiStatus("有尚未读取的图片任务，请先读取结果或结束跟踪。", true);
  setBusy(true);
  aiStatus("正在识别家具及可换布部件…");
  try {
    const data = await callAI("analyze", {
      image: imageData(base),
      instruction: $("#aiInstruction").value,
    });
    aiParts = data.parts.map((p) => ({ ...p, selected: true }));
    showParts();
    if (!aiParts.length) {
      aiStatus("没有识别到可换布表面，请手动涂选，或换一张清晰照片。", true);
      return;
    }
    applyParts();
    aiStatus(
      "已识别「" +
        data.furniture +
        "」的 " +
        aiParts.length +
        " 个部件。请勾选要换布的部分，绿色轮廓可用笔刷修正。" +
        (data.notes ? "\n" + data.notes : ""),
    );
  } catch (e) {
    aiStatus(friendlyError(e), true);
  } finally {
    setBusy(false);
  }
}
function hasMask() {
  const d = mc.getImageData(0, 0, W, H).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  return false;
}
function materialReference() {
  if (material.image) {
    let c = document.createElement("canvas");
    let k = Math.min(
      1,
      1200 / Math.max(material.image.width, material.image.height),
    );
    c.width = Math.max(1, Math.round(material.image.width * k));
    c.height = Math.max(1, Math.round(material.image.height * k));
    c.getContext("2d").drawImage(material.image, 0, 0, c.width, c.height);
    return imageData(c);
  }
  let c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  c.getContext("2d").drawImage(tex, 0, 0, 512, 512, 0, 0, 512, 512);
  return imageData(c);
}
function guideReference() {
  const c = layer(),
    g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.drawImage(mask, 0, 0);
  return c.toDataURL("image/png");
}
function recovery() {
  const visible = !!pendingTask;
  $("#taskRecovery").hidden = !visible;
  if (visible)
    $("#taskLabel").textContent =
      "当前任务：" +
      pendingTask.id +
      " · " +
      pendingTask.status +
      "。可在本页继续读取；刷新页面会清除本页任务引用，请先等待结果或记录任务编号。";
}
async function showTaskResult(task) {
  if (task.status === "failed" || task.status === "cancelled") {
    pendingTask = null;
    recovery();
    throw new Error(
      "任务未完成：" +
        (task.error?.code || task.status) +
        "。请查看 AiHubMix 控制台；未自动重复生成。",
    );
  }
  if (task.status !== "completed") return false;
  const out = task.output?.[0];
  if (!out) throw new Error("生成完成但未返回图片，请到 AiHubMix 控制台查看。");
  let src;
  if (out.b64_json) src = "data:image/png;base64," + out.b64_json;
  else if (out.content_url)
    src = URL.createObjectURL(await callAI("result", { url: out.content_url }));
  else throw new Error("生成结果缺少图片地址。");
  try {
    const im = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () =>
        reject(new Error("结果图片无法解码，请重新读取当前任务。"));
      i.src = src;
    });
    aiCanvas = layer();
    const a = aiCanvas.getContext("2d");
    a.drawImage(im, 0, 0, W, H);
    setTool("");
    setView("result");
    render(false);
    aiStatus(
      "AI 图片已返回。请核对目标布料颜色和织纹；任务完成不代表材质一定匹配，可用「左右对比」检查。",
    );
    pendingTask = null;
    recovery();
    return true;
  } finally {
    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
  }
}
async function pollTask() {
  for (let i = 0; i < 20 && pendingTask; i++) {
    if (await showTaskResult(pendingTask)) return;
    aiStatus(
      "AI 正在生成… 已等待约 " + i * 15 + " 秒。任务编号：" + pendingTask.id,
    );
    await new Promise((r) => setTimeout(r, 15000));
    pendingTask = await readTask(pendingTask.id);
    recovery();
  }
  if (pendingTask && (await showTaskResult(pendingTask))) return;
  if (pendingTask)
    aiStatus("任务仍在处理，可稍后点击「读取当前任务结果」。无需再次生成。");
}
async function generate() {
  if (aiBusy || !needKey()) return;
  if (pendingTask)
    return aiStatus("已有待完成任务，请读取当前结果，勿重复生成。", true);
  if (!hasMask())
    return aiStatus("请先智能识别并勾选部件，或手动涂选要换布的区域。", true);
  setBusy(true);
  setTool("");
  aiStatus("正在生成 AI 换材质效果… 通常需要等待，请不要重复点击。");
  try {
    const snapshot = {
      image: imageData(base),
      material: materialReference(),
      guide: guideReference(),
      model: $("#imageModel").value,
      parts: aiParts.filter((p) => p.selected),
      instruction:
        $("#aiInstruction").value +
        (selectionEdited
          ? " The hand-corrected region guide takes precedence over part descriptions."
          : ""),
      materialName: material.name,
      materialColor: material.color,
      width: W,
      height: H,
      guideType: "binary",
      async: true,
    };
    pendingTask = await callAI("generate", snapshot);
    recovery();
    if (!(await showTaskResult(pendingTask))) await pollTask();
  } catch (e) {
    aiStatus(friendlyError(e), true);
    recovery();
  } finally {
    setBusy(false);
  }
}
$("#analyze").onclick = analyze;
$("#generate").onclick = generate;
$("#imageModel").onchange = updateEstimate;
$("#selectAllParts").onclick = () => {
  const next = !aiParts.every((p) => p.selected);
  aiParts.forEach((p) => (p.selected = next));
  showParts();
  applyParts();
};
$("#aiSettings").onclick = () => $("#settingsDialog").showModal();
$("#closeSettings").onclick = () => $("#settingsDialog").close();
$("#resumeTask").onclick = async () => {
  if (aiBusy || !pendingTask || !needKey()) return;
  setBusy(true);
  aiStatus("正在读取已有任务结果，不会重复生成…");
  try {
    pendingTask = await readTask(pendingTask.id);
    recovery();
    await pollTask();
  } catch (e) {
    aiStatus(friendlyError(e), true);
  } finally {
    setBusy(false);
  }
};
$("#dismissTask").onclick = () => {
  pendingTask = null;
  recovery();
  aiStatus(
    "已停止本页跟踪；上游任务和费用不会被取消。可在 AiHubMix 控制台查找。",
  );
};
updateEstimate();
fetch("/api/config")
  .then((r) => r.json())
  .then((d) => {
    serverConfigured = d.configured === true;
    updateConnection();
  })
  .catch(() => aiStatus("AI 服务暂不可用，本地预览仍可使用。", true));

$("#loadTestSamples").onclick = async () => {
  if (aiBusy) return;
  try {
    const load = (src) =>
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("测试素材载入失败"));
        im.src = src;
      });
    const [sofa, fabric] = await Promise.all([
      load("/samples/ivory-sofa.png"),
      load("/samples/terracotta-linen.png"),
    ]);
    aiCanvas = null;
    resetAISelection();
    history = [];
    isDemo = false;
    setFurnitureImage(sofa);
    mc.clearRect(0, 0, W, H);
    maskPresent = false;
    $("#imageName").textContent = "当前：米白三人沙发（AI 测试图）";
    choose({
      name: "陶土红棉麻（AI 测试布料）",
      color: "#a53319",
      type: "custom",
      code: "TEST FABRIC",
      image: fabric,
    });
    setTool("");
    setView("result");
    render();
    $("#instruction").textContent =
      "测试素材已载入。点击「智能识别部件」，选择要换布的部分后生成。";
    aiStatus("米白沙发和陶土红布料已载入，可以开始智能识别。");
  } catch (e) {
    aiStatus(e.message, true);
  }
};
