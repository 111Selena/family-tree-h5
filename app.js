/**
 * 家族树 H5 主逻辑
 * ----------------
 * - 上传合照 → AI 生成整张插画合影（3D 童话风格）
 * - 大树场景中央展示带叶子装饰的相框
 * - 直接展示结果，可保存画面 / 再玩一次
 */

(() => {
  "use strict";

  // ===== 叶子素材（已去底透明 PNG） =====
  const LEAF_IMAGES = [
    "leaves/leaf-1.png",
    "leaves/leaf-2.png",
    "leaves/leaf-3.png",
    "leaves/leaf-4.png",
    "leaves/leaf-5.png",
    "leaves/leaf-6.png",
    "leaves/leaf-7.png",
    "leaves/leaf-8.png",
  ];

  // ============================================================
  // 【AI 插画生成配置】火山方舟 · 即梦 Seedream 4.5 · 漫画+水彩质感
  // ============================================================
  // 直接让 AI 输出「复古漫画人物结构 + 水彩柔和光影」风格（用户最终选定）。
  // 不再叠加前端滤镜，靠 prompt 一步到位控制温馨感和人物细节。
  // ⚠️ 安全提示：密钥会随网页分发，个人项目/小范围使用可以；
  //    正式商用请改用后端代理转发，不要把密钥放前端。
  const AI_CONFIG = {
    enabled: true,    // true = 走 AI 生成插画合影；false = 直接用原图
    apiKey: "ark-1c5795f2-8e6c-471f-a1bc-b7ff2944d498-c3317",
    model: "doubao-seedream-4-5-251128",  // Seedream 4.5
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    // size 不再固定，由 computeSeedreamSize() 根据原图比例动态计算，保持原始宽高比
    // Seedream 4.5 要求输出面积 ≥ 3,686,400 像素（约 1920×1920）
    // 漫画+水彩质感 prompt（用户最终选定：保留复古漫画人物结构，叠加水彩柔和光影）
    prompt:
      "将这张全家福照片转换为【复古漫画人物结构 + 水彩柔和光影】的插画风格。" +
      "核心原则：人物的脸型、五官结构、表情神态、发型、姿势、服装、位置关系【必须像美式复古漫画一样清晰真实】，" +
      "不能卡通化、不能大眼、不能磨平面部细节；" +
      "但上色和光影不要复古漫画那种硬边色块和锐利对比，而要改成【柔和的水彩晕染质感】。" +
      "具体要求：1) 眼睛必须画出完整眼部结构——眼白、虹膜、瞳孔、高光、睫毛，不能是两个黑点；" +
      "2) 眉毛要有毛发质感和自然弧度，不能只是一条线；" +
      "3) 鼻子要有鼻梁、鼻尖和自然阴影，不能简化为点；" +
      "4) 嘴巴要有唇线、唇形和微笑表情，不能只是一条线；" +
      "5) 每个人物的脸型、五官比例、表情神态必须彼此区分，保持真实 likeness。" +
      "光影与色调要求：阴影边缘要羽化晕染，不要锐利的明暗交界线；" +
      "高光使用淡淡的暖白色，类似水彩留白；" +
      "整体色调温暖、柔和，偏奶油色/米色调，降低对比度，营造温馨家庭氛围；" +
      "皮肤添加轻微腮红和暖色，可见柔和的水彩笔触和轻微水彩纸纹；" +
      "显著减少面部的皱纹、细纹和眼袋，皮肤纹理自然真实但不过度磨皮，避免塑料感。" +
      "背景元素保留但做柔和水彩化处理，与人物融合自然。" +
      "保持整体构图、人数、姿势、服装、场景和原始画面比例不变。" +
      "画面中不要添加文字气泡、对话框或多余的装饰文字。",
  };

  // ===== 相框叶子装饰的位置模板（相对相框的百分比，r 为旋转角度） =====
  const FRAME_LEAF_SPOTS = [
    { x: 6, y: -14, r: -25 }, { x: 30, y: -18, r: 15 }, { x: 55, y: -12, r: -10 }, { x: 80, y: -16, r: 30 },
    { x: -12, y: 20, r: 60 }, { x: -14, y: 62, r: 40 },
    { x: 104, y: 28, r: -60 }, { x: 106, y: 66, r: -40 },
    { x: 10, y: 108, r: 20 }, { x: 40, y: 112, r: -15 }, { x: 70, y: 108, r: 25 }, { x: 92, y: 112, r: -20 },
  ];

  // ============================================================
  // 【方案C】前端水彩滤镜开关
  // 用户已改让 AI 直接输出「漫画+水彩质感」，不再需要前端滤镜，
  // 因此强度设为 0（保留函数但跳过处理，方便以后随时恢复）。
  // ============================================================
  const FILTER_STRENGTH = 0;     // 0 = 关闭前端滤镜，完全由 AI prompt 控制
  const FILTER_MAX_SIDE = 1200;  // 滤镜处理时的最大边长（保留供后续复用）

  // ===== DOM 引用 =====
  const app = document.getElementById("app");
  const heroTitle = document.getElementById("hero-title");
  const fallingLeavesContainer = document.getElementById("falling-leaves");
  const treeBg = document.getElementById("tree-bg");
  const interactionLayer = document.getElementById("interaction-layer");
  const cameraInput = document.getElementById("camera-input");
  const galleryInput = document.getElementById("gallery-input");
  const uploadBar = document.getElementById("upload-bar");
  const transitionOverlay = document.getElementById("transition-overlay");
  const transitionText = document.getElementById("transition-text");
  const transitionProgress = document.getElementById("transition-progress");
  const transitionProgressBar = document.getElementById("transition-progress-bar");
  const transitionProgressText = document.getElementById("transition-progress-text");
  const finishModal = document.getElementById("finish-modal");
  const saveBtn = document.getElementById("save-btn");
  const replayBtn = document.getElementById("replay-btn");
  const finishPanelActions = document.getElementById("finish-panel-actions");
  const finishPanelSave = document.getElementById("finish-panel-save");
  const finishSaveImg = document.getElementById("finish-save-img");
  const finishDownloadLink = document.getElementById("finish-download-link");
  const finishBackBtn = document.getElementById("finish-back-btn");
  const composeCanvas = document.getElementById("compose-canvas");

  // ===== 状态 =====
  let state = {
    file: null,
    image: null,
    illustration: "",        // AI 生成的插画合影（dataURL）
    illustrationRatio: 1,    // 插画宽高比
    progressTimer: null,
    isProcessing: false,
  };

  // ===== 初始化 =====
  async function init() {
    bindEvents();
    await preloadLeafImages();
    createFallingLeaves();
  }

  function bindEvents() {
    cameraInput.addEventListener("change", handlePhotoUpload);
    galleryInput.addEventListener("change", handlePhotoUpload);

    saveBtn.addEventListener("click", saveScreen);
    replayBtn.addEventListener("click", resetApp);
    finishBackBtn.addEventListener("click", () => showFinishPanel("actions"));

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.illustration) {
          layoutFrame();
        }
      }, 200);
    });
  }

  // ===== 预加载叶子素材 =====
  function preloadLeafImages() {
    return Promise.all(
      LEAF_IMAGES.map(
        (src) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          })
      )
    );
  }

  // ===== 飘落叶子动效 =====
  function createFallingLeaves() {
    const count = 14;
    fallingLeavesContainer.innerHTML = "";

    for (let i = 0; i < count; i++) {
      const leaf = document.createElement("img");
      const leafIndex = i % LEAF_IMAGES.length;
      leaf.src = LEAF_IMAGES[leafIndex];
      leaf.className = "falling-leaf";
      leaf.alt = "";

      const size = 18 + Math.random() * 28;
      const startX = Math.random() * 100;
      const delay = Math.random() * 8;
      const duration = 7 + Math.random() * 8;
      const sway = (Math.random() * 30 + 15) * (Math.random() > 0.5 ? 1 : -1);
      const opacity = 0.45 + Math.random() * 0.4;

      leaf.style.setProperty("--size", `${size}px`);
      leaf.style.setProperty("--start-x", `${startX}%`);
      leaf.style.setProperty("--delay", `${delay}s`);
      leaf.style.setProperty("--duration", `${duration}s`);
      leaf.style.setProperty("--sway", `${sway}vw`);
      leaf.style.setProperty("--opacity", opacity);

      fallingLeavesContainer.appendChild(leaf);
    }
  }

  // ===== 上传合影 =====
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || state.isProcessing) return;

    state.isProcessing = true;
    state.file = file;

    heroTitle.classList.add("is-hidden");

    try {
      const image = await fileToImage(file);
      state.image = image;
      await proceedToTree();
    } catch (err) {
      console.error("上传失败:", err);
      hideTransition();
      state.isProcessing = false;
      alert("图片读取失败，请换一张试试～");
    }
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // ===== 主流程：生成插画合影并展示相框 =====
  async function proceedToTree() {
    uploadBar.classList.add("is-hidden");
    const useAI = AI_CONFIG.enabled && AI_CONFIG.apiKey;
    showTransition(useAI ? "AI 正在绘制全家福插画…" : "正在准备相框…");

    try {
      if (useAI) {
        startProgressSimulation("AI 正在绘制全家福插画");
        try {
          state.illustration = await generateIllustration(state.image);
        } catch (err) {
          console.warn("[AI 插画] 生成失败，回退到原图：", err);
          state.illustration = imageToDataURL(state.image);
        }
        finishProgress("全家福插画绘制完成");
        await wait(600); // 让用户看到 100%
      } else {
        state.illustration = imageToDataURL(state.image);
      }

      // 方案C：给插画叠加柔和水彩滤镜（人物结构不变，光影变温馨）
      try {
        const raw = await loadImage(state.illustration);
        const filtered = applyWatercolorFilter(raw, FILTER_STRENGTH, FILTER_MAX_SIDE);
        state.illustration = filtered.toDataURL("image/jpeg", 0.92);
      } catch (err) {
        console.warn("[水彩滤镜] 应用失败，保持原图：", err);
      }

      // 加载插画拿到宽高比，再渲染相框
      const illustImg = await loadImage(state.illustration);
      state.illustrationRatio = illustImg.naturalWidth / illustImg.naturalHeight || 1;

      renderPhotoFrame();
      treeBg.classList.add("is-zoomed");
      interactionLayer.classList.add("is-active");

      // 直接展示结果：稍等片刻让相框动画播完，再弹保存
      setTimeout(showFinishModal, 1400);
    } catch (err) {
      console.error("[proceedToTree] 流程异常:", err);
    } finally {
      hideTransition();
      treeBg.classList.add("is-zoomed");
      interactionLayer.classList.add("is-active");
      state.isProcessing = false;
    }
  }

  // ===== AI 插画合影生成（即梦 Seedream 4.5 同步接口） =====
  async function generateIllustration(image) {
    // 1) 整张合照压缩成 JPEG dataURL（长边 ≤1024px，控制请求体积）
    const canvas = imageToCanvas(image);
    const dataUrl = canvasToJPEGDataURL(canvas, 1024, 0.85);
    if (!dataUrl) throw new Error("图片压缩失败");

    // 2) 根据原图比例动态计算 Seedream 输出尺寸，保持原始宽高比
    const size = computeSeedreamSize(image.naturalWidth, image.naturalHeight);

    // 3) 同步调用 Seedream 图生图（返回 base64，避免跨域/URL 过期问题）
    const res = await fetch(`${AI_CONFIG.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_CONFIG.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        prompt: AI_CONFIG.prompt,
        image: dataUrl,          // 支持 base64 直传
        size: size,              // 保持原图比例，不再强制 1:1
        response_format: "b64_json",
        watermark: false,
      }),
    });
    if (!res.ok) throw new Error(`AI 生成失败 HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const b64 = json.data && json.data[0] && json.data[0].b64_json;
    if (!b64) throw new Error("AI 响应中没有图片数据");
    return `data:image/png;base64,${b64}`;
  }

  // ===== 图片工具 =====
  function imageToCanvas(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas;
  }

  function imageToDataURL(image) {
    return imageToCanvas(image).toDataURL("image/jpeg", 0.9);
  }

  // canvas → 压缩 JPEG dataURL（控制 AI 请求体积，base64 后 ≤10MB）
  function canvasToJPEGDataURL(canvas, maxSize, quality) {
    const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
    const w = Math.round(canvas.width * scale);
    const h = Math.round(canvas.height * scale);

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d").drawImage(canvas, 0, 0, w, h);
    return out.toDataURL("image/jpeg", quality);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // 根据原图宽高比，计算 Seedream 4.5 支持的最小输出尺寸（保持比例，面积 ≥ 3,686,400）
  function computeSeedreamSize(srcW, srcH) {
    const minArea = 3686400;
    const ratio = Math.max(srcW, 1) / Math.max(srcH, 1);
    let width, height;
    if (ratio >= 1) {
      // 横图/方图：以宽为基准
      width = Math.ceil(Math.sqrt(minArea * ratio));
      height = Math.max(1, Math.round(width / ratio));
    } else {
      // 竖图：以高为基准
      height = Math.ceil(Math.sqrt(minArea / ratio));
      width = Math.max(1, Math.round(height * ratio));
    }
    // 保险：确保面积达标（避免四舍五入导致略低于阈值）
    while (width * height < minArea) {
      if (ratio >= 1) width++; else height++;
    }
    return `${width}x${height}`;
  }

  // ===== 方案C：水彩滤镜管线（降对比 / 暖色 / 柔光 / 纸纹） =====
  // 输入一张图片元素，按 strength(0~1) 叠加水彩质感，返回处理后的 canvas。
  // 兼容性说明：全部用像素级 getImageData + drawImage 缩放实现，
  // 不依赖 ctx.filter 和 soft-light/overlay 等高级混合模式（旧 WebView/微信内置浏览器可用）。
  function applyWatercolorFilter(img, strength, maxSide) {
    const s = Math.max(0, Math.min(1, strength));
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(2, Math.round(img.naturalWidth * scale));
    const h = Math.max(2, Math.round(img.naturalHeight * scale));

    // 1) 基础层：像素级降对比 + 暖色(sepia) + 微提亮
    const base = applyPixelTone(img, w, h, s);

    // 2) 柔光层：缩小再放大的近似高斯模糊（保留明暗，叠回后阴影边缘羽化）
    const blurC = makeBlurCanvas(img, w, h, 2);

    // 3) 水彩纸纹（程序化噪点纹理，平铺）
    const paper = makePaperTexture(128);

    // 4) 合成 fullFx：基础层 + 半透明模糊柔光 + 纸纹颗粒
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(base, 0, 0);
    tctx.globalAlpha = 0.6 * s;
    tctx.drawImage(blurC, 0, 0);
    tctx.globalAlpha = 0.45 * s;
    for (let y = 0; y < h; y += paper.height) {
      for (let x = 0; x < w; x += paper.width) {
        tctx.drawImage(paper, x, y);
      }
    }
    tctx.globalAlpha = 1;

    // 5) 与原图按强度插值混合（0% = 原图，100% = 满滤镜）
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d");
    octx.drawImage(img, 0, 0, w, h);
    octx.globalAlpha = s;
    octx.drawImage(tmp, 0, 0);
    octx.globalAlpha = 1;

    return out;
  }

  // 像素级调色：降对比(0.20) + 暖色 sepia(0.45) + 提亮(0.08)，按强度 s 线性生效
  function applyPixelTone(img, w, h, s) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const contrast = 1 - 0.20 * s;
    const bright = 1 + 0.08 * s;
    const sepiaK = 0.45 * s;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      // 降对比（围绕 128 收拢）
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
      // 提亮
      r *= bright;
      g *= bright;
      b *= bright;
      // 暖色（向 sepia 插值）
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      r += (sr - r) * sepiaK;
      g += (sg - g) * sepiaK;
      b += (sb - b) * sepiaK;
      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  // 近似高斯模糊：把图反复"缩小 → 放大"，利用插值产生柔和羽化（passes 越大越糊）
  function makeBlurCanvas(img, w, h, passes) {
    const cur = document.createElement("canvas");
    cur.width = w;
    cur.height = h;
    cur.getContext("2d").drawImage(img, 0, 0, w, h);
    for (let p = 0; p < passes; p++) {
      const sW = Math.max(2, Math.round(w / 12));
      const sH = Math.max(2, Math.round(h / 12));
      const small = document.createElement("canvas");
      small.width = sW;
      small.height = sH;
      small.getContext("2d").drawImage(cur, 0, 0, sW, sH);
      const ctx = cur.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, w, h);
    }
    return cur;
  }

  // 生成一张近白的噪点纸纹，用于水彩颗粒质感（纯像素，无 filter 依赖）
  function makePaperTexture(size) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    const imgData = ctx.createImageData(size, size);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 228 + Math.random() * 27; // 近白轻微抖动
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  // ===== 相框渲染 =====
  function renderPhotoFrame() {
    interactionLayer.innerHTML = "";

    const frame = document.createElement("div");
    frame.className = "photo-frame";
    frame.id = "photo-frame";

    frame.innerHTML = `
      <div class="photo-frame__mat">
        <img class="photo-frame__photo" src="${state.illustration}" alt="全家福插画" />
      </div>
    `;

    // 四周叶子装饰（沿相框边缘散布，带随机旋转与大小）
    FRAME_LEAF_SPOTS.forEach((spot, i) => {
      const leaf = document.createElement("img");
      leaf.className = "photo-frame__leaf";
      leaf.src = LEAF_IMAGES[i % LEAF_IMAGES.length];
      leaf.alt = "";
      leaf.draggable = false;

      // 参数带一点随机抖动，每次都不一样，更自然
      const jitterX = (Math.random() - 0.5) * 6;
      const jitterY = (Math.random() - 0.5) * 5;
      const jitterR = (Math.random() - 0.5) * 24;
      const size = 34 + Math.random() * 22;

      const left = spot.x + jitterX;
      const top = spot.y + jitterY;
      const rotate = spot.r + jitterR;

      leaf.style.left = `${left}%`;
      leaf.style.top = `${top}%`;
      leaf.style.width = `${Math.round(size)}px`;
      leaf.style.height = "auto";
      leaf.style.transform = `translate(-50%, -50%) rotate(${rotate}deg)`;
      // 保存旋转角度，供保存画面时绘制
      leaf.dataset.rotate = rotate.toFixed(1);

      frame.appendChild(leaf);
    });

    interactionLayer.appendChild(frame);
    layoutFrame();
  }

  // 依据插画宽高比与屏幕尺寸，计算相框宽度（CSS 负责居中）
  function layoutFrame() {
    const frame = document.getElementById("photo-frame");
    if (!frame) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 相框宽度：默认约 76vw（上限 400px）
    let width = Math.min(vw * 0.76, 400);
    // 相框高度（含相纸边）约 = 宽 / 比例 + padding
    const matPad = 26; // 上下合计的相纸边（约 2×13px）
    let height = width / state.illustrationRatio + matPad;

    // 高度超限（竖构图合影）：按高度反推宽度
    const maxH = vh * 0.44;
    if (height > maxH) {
      height = maxH;
      width = (height - matPad) * state.illustrationRatio;
    }

    frame.style.width = `${Math.round(width)}px`;
  }

  // ===== 过渡层控制 =====
  function showTransition(text) {
    resetTransitionProgress();
    transitionText.textContent = text;
    transitionOverlay.classList.add("is-visible");
    transitionOverlay.setAttribute("aria-hidden", "false");
  }

  function hideTransition() {
    resetTransitionProgress();
    transitionOverlay.classList.remove("is-visible");
    transitionOverlay.setAttribute("aria-hidden", "true");
  }

  // 模拟进度：单张图生成时间不定，用缓增进度给用户"正在干活"的反馈
  function startProgressSimulation(label) {
    transitionProgress.classList.add("is-visible");
    transitionProgress.setAttribute("aria-hidden", "false");
    transitionProgressBar.style.width = "5%";
    transitionProgressText.textContent = `${label}…`;

    let pct = 5;
    state.progressTimer = setInterval(() => {
      // 越接近 90% 涨得越慢，永不自行到达 100%
      const speed = Math.max(0.6, (90 - pct) * 0.045);
      pct = Math.min(90, pct + speed);
      transitionProgressBar.style.width = `${pct.toFixed(1)}%`;
    }, 600);
  }

  function finishProgress(label) {
    if (state.progressTimer) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
    }
    transitionProgressBar.style.width = "100%";
    transitionProgressText.textContent = `${label}！`;
  }

  function resetTransitionProgress() {
    if (state.progressTimer) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
    }
    transitionProgressBar.style.width = "0%";
    transitionProgressText.textContent = "";
    transitionProgress.classList.remove("is-visible");
    transitionProgress.setAttribute("aria-hidden", "true");
  }

  // ===== 完成弹窗 =====
  function showFinishModal() {
    showFinishPanel("actions");
    finishModal.classList.add("is-visible");
    finishModal.setAttribute("aria-hidden", "false");
  }

  function hideFinishModal() {
    finishModal.classList.remove("is-visible");
    finishModal.setAttribute("aria-hidden", "true");
  }

  // 切换弹窗面板：actions=按钮区  /  save=长按保存预览
  function showFinishPanel(name) {
    finishPanelActions.hidden = name !== "actions";
    finishPanelSave.hidden = name !== "save";
  }

  // ===== 保存此画面 =====
  async function saveScreen() {
    if (state.isProcessing) return;
    state.isProcessing = true;

    try {
      const dataUrl = await composeFinalImage();
      // 微信内置浏览器不支持 a[download]，改成"长按图片保存到相册"：
      // 直接用 dataURL 作为 <img> src（微信长按存图对 dataURL 比 blob: 链接更友好，
      // blob: 链接在安卓微信里基本无法长按保存）。
      finishSaveImg.src = dataUrl;
      finishDownloadLink.href = dataUrl;
      finishDownloadLink.setAttribute(
        "download",
        `家族树全家福_${new Date().getTime()}.png`
      );
      showFinishPanel("save");
    } catch (err) {
      console.error("保存失败:", err);
      alert("保存失败，请截图保存吧～");
    } finally {
      state.isProcessing = false;
    }
  }

  async function composeFinalImage() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    composeCanvas.width = width * dpr;
    composeCanvas.height = height * dpr;
    composeCanvas.style.width = `${width}px`;
    composeCanvas.style.height = `${height}px`;

    const ctx = composeCanvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // 1. 绘制大树背景（与当前缩放保持一致：scale 1.24 + translateY 6.4vh，origin center 35%）
    const bgImg = await loadImage("tree-bg-compressed.jpg");
    const coverScale = Math.max(width / bgImg.naturalWidth, height / bgImg.naturalHeight);
    const W = bgImg.naturalWidth * coverScale;
    const H = bgImg.naturalHeight * coverScale;
    // background-position: center 25% 时图片左上角位置
    const x0 = (width - W) / 2;
    const y0 = 0.25 * (height - H);
    // CSS transform: scale(1.24) translateY(6.4vh)，origin 为 (50%, 35%)
    const ZOOM = 1.24;
    const ox = width * 0.5;
    const oy = height * 0.35;
    const drawW = W * ZOOM;
    const drawH = H * ZOOM;
    const drawX = ox + ZOOM * (x0 - ox);
    const drawY = oy + ZOOM * (y0 - oy) + height * 0.064;
    ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);

    // 2. 绘制相框（按 DOM 实际位置，所见即所得）
    const frame = document.getElementById("photo-frame");
    if (frame) {
      const frameRect = frame.getBoundingClientRect();
      const matEl = frame.querySelector(".photo-frame__mat");
      const matRect = matEl.getBoundingClientRect();
      const photoEl = frame.querySelector(".photo-frame__photo");
      const photoRect = photoEl.getBoundingClientRect();

      // 相纸底（含阴影）
      ctx.save();
      ctx.shadowColor = "rgba(46, 71, 26, 0.35)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#fffdf5";
      roundRect(ctx, matRect.left, matRect.top, matRect.width, matRect.height, 10);
      ctx.fill();
      ctx.restore();

      // 插画合影
      if (photoEl && photoEl.src) {
        const img = await loadImage(photoEl.src);
        ctx.save();
        roundRect(ctx, photoRect.left, photoRect.top, photoRect.width, photoRect.height, 4);
        ctx.clip();
        ctx.drawImage(img, photoRect.left, photoRect.top, photoRect.width, photoRect.height);
        ctx.restore();
      }

      // 四周叶子装饰（按 DOM 位置与旋转角度绘制）
      const leafEls = frame.querySelectorAll(".photo-frame__leaf");
      for (const leafEl of leafEls) {
        const leafRect = leafEl.getBoundingClientRect();
        const leafImg = await loadImage(leafEl.src);
        const rotate = parseFloat(leafEl.dataset.rotate || "0");
        ctx.save();
        ctx.translate(leafRect.left + leafRect.width / 2, leafRect.top + leafRect.height / 2);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(leafImg, -leafRect.width / 2, -leafRect.height / 2, leafRect.width, leafRect.height);
        ctx.restore();
      }
    }

    // 3. 底部文案
    ctx.font = "600 18px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#5a6b3a";
    ctx.textAlign = "center";
    ctx.fillText("每一片叶子，都是家人的模样", width / 2, height - 50);

    return composeCanvas.toDataURL("image/png");
  }

  // 绘制圆角矩形路径
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ===== 重置 =====
  function resetApp() {
    hideFinishModal();
    treeBg.classList.remove("is-zoomed");
    interactionLayer.classList.remove("is-active");
    interactionLayer.innerHTML = "";
    uploadBar.classList.remove("is-hidden");
    heroTitle.classList.remove("is-hidden");
    cameraInput.value = "";
    galleryInput.value = "";

    state = {
      file: null,
      image: null,
      illustration: "",
      illustrationRatio: 1,
      progressTimer: null,
      isProcessing: false,
    };
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  init();
})();
