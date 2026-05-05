// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const accessCodeInput = document.getElementById('accessCode');
const submitCodeBtn = document.getElementById('submitCode');
const errorMessage = document.getElementById('errorMessage');

// Custom alert elements
const customAlertOverlay = document.getElementById('customAlertOverlay');
const customAlertContent = document.getElementById('customAlertContent');
const customAlertBtn = document.getElementById('customAlertBtn');

// User info elements
const userInfo = document.getElementById('userInfo');
const userName = document.getElementById('userName');
const userPlan = document.getElementById('userPlan');
const creditsCount = document.getElementById('creditsCount');
const editBtnCredit = document.getElementById('editBtnCredit');
const generateBtnCredit = document.getElementById('generateBtnCredit');
const plansSection = document.getElementById('plansSection');
const plansGrid = document.getElementById('plansGrid');

// Mode switching
const tabBtns = document.querySelectorAll('.tab-btn');
const editMode = document.getElementById('editMode');
const generateMode = document.getElementById('generateMode');

// Edit mode elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const previewArea = document.getElementById('previewArea');
const previewImage = document.getElementById('previewImage');
const removeBtn = document.getElementById('removeBtn');
const promptInput = document.getElementById('promptInput');
const editBtn = document.getElementById('editBtn');

// Generate mode elements
const generatePrompt = document.getElementById('generatePrompt');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const stepsInput = document.getElementById('stepsInput');
const cfgInput = document.getElementById('cfgInput');
const gridModeCheckbox = document.getElementById('gridModeCheckbox');
const generateBtn = document.getElementById('generateBtn');

// Common elements
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');
const loadingOverlay = document.getElementById('loadingOverlay');

const negativePrompt = document.getElementById('negativePrompt');
const editPresetBar = document.getElementById('editPresetBar');
const resultMetaSummary = document.getElementById('resultMetaSummary');
const compareBox = document.getElementById('compareBox');
const compareImgBefore = document.getElementById('compareImgBefore');
const compareImgAfter = document.getElementById('compareImgAfter');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const forgeNav = document.getElementById('forgeNav');
const historyModal = document.getElementById('historyModal');
const historyModalMeta = document.getElementById('historyModalMeta');
const historyModalBefore = document.getElementById('historyModalBefore');
const historyModalAfter = document.getElementById('historyModalAfter');
const historyModalOpenEditor = document.getElementById('historyModalOpenEditor');
const historyModalClose = document.getElementById('historyModalClose');
const btnRefreshHealth = document.getElementById('btnRefreshHealth');
const settingsHealthOut = document.getElementById('settingsHealthOut');
const settingsVersionOut = document.getElementById('settingsVersionOut');
const btnClearHistory = document.getElementById('btnClearHistory');

/**
 * BFF 根地址。默认与页面同源（须通过 node server.js 提供整站）。
 * 静态页与 API 分离时：在 index.html 设置 meta name="ptp-api-base" content="http://主机:38024"
 * 或在任意脚本前执行 window.PTP_API_BASE = 'http://...'。
 */
function getPtpApiBase() {
    if (
        typeof window !== 'undefined' &&
        window.PTP_API_BASE != null &&
        String(window.PTP_API_BASE).trim() !== ''
    ) {
        return String(window.PTP_API_BASE).trim().replace(/\/$/, '');
    }
    const meta = document.querySelector('meta[name="ptp-api-base"]');
    if (meta && meta.content && String(meta.content).trim() !== '') {
        return String(meta.content).trim().replace(/\/$/, '');
    }
    return '';
}

function apiUrl(path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    const b = getPtpApiBase();
    if (!b) return p;
    return `${b.replace(/\/$/, '')}${p}`;
}

const HISTORY_STORAGE_KEY = 'imageforge_history_v1';
const HISTORY_LIMIT = 40;
const TASK_CLIENT_TIMEOUT_MS = 600000;

let selectedFile = null;
let currentMode = 'edit';
let currentLang = 'en';
let isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
let progressInterval = null;
/** 结果图完整下载 URL（相对路径 /outputs/...） */
let currentOriginalImage = null;
let currentUser = null;
let currentAccessCode = null;
let editIntentTask = 'style';
let forgePresets = null;
let activeAbortController = null;
let compareBeforeDataUrl = null;
let lastResultSummary = {};
let forgeUserCancelled = false;

/** 与 server.js normalizeEditTemplate 对齐 */
const EDIT_WORKFLOW_TEMPLATE = {
    style: 'img2img_style',
    upscale: 'image_upscale',
    background: 'background_repaint'
};

// 自定义弹窗函数
function showAlert(message) {
    customAlertContent.textContent = message;
    customAlertOverlay.classList.remove('hidden');
}

// 关闭自定义弹窗
customAlertBtn.addEventListener('click', () => {
    customAlertOverlay.classList.add('hidden');
});

// 点击遮罩层关闭弹窗
customAlertOverlay.addEventListener('click', (e) => {
    if (e.target === customAlertOverlay) {
        customAlertOverlay.classList.add('hidden');
    }
});

// 检测是否支持保存到相册
function canSaveToAlbum() {
    return isMobile && (
        // iOS Safari 支持 canvas.toBlob
        (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype.toBlob) ||
        // 或者支持 Web Share API
        (navigator.share && navigator.canShare)
    );
}

// 显示加载进度（仅显示UI，不模拟进度）
function showLoadingProgress() {
    // 显示结果区域
    resultSection.classList.remove('hidden');
    
    // 如果图片还没有src，设置一个占位符确保容器有尺寸
    if (!resultImage.src || resultImage.src === window.location.href) {
        // 创建一个透明占位图
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        resultImage.src = canvas.toDataURL();
    }
    
    // 显示遮罩
    loadingOverlay.classList.remove('hidden');
    if (cancelTaskBtn) cancelTaskBtn.classList.remove('hidden');

    const progressNumber = document.querySelector('.progress-number');
    
    // 清除之前的定时器
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    // 初始化进度为0
    progressNumber.textContent = '0';
}

// 更新真实进度（由SSE事件调用）
function updateRealProgress(progress) {
    const progressNumber = document.querySelector('.progress-number');
    progressNumber.textContent = Math.floor(progress);
}

// 隐藏加载进度
function hideLoadingProgress() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    // 快速跳到100%
    const progressNumber = document.querySelector('.progress-number');
    progressNumber.textContent = '100';
    
    // 短暂延迟后隐藏遮罩
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        if (cancelTaskBtn) cancelTaskBtn.classList.add('hidden');
        // 重置进度
        setTimeout(() => {
            progressNumber.textContent = '0';
        }, 300);
    }, 200);
}

// 国际化文本
const i18n = {
    en: {
        title: 'ImageForge Web',
        'status.checking': 'Checking...',
        'status.ready': 'Ready',
        'status.offline': 'Offline',
        'tabs.edit': 'Edit Image',
        'tabs.generate': 'Generate Image',
        'auth.title': 'Access Code Required',
        'auth.description': 'Enter the beta access code to continue',
        'auth.placeholder': 'Enter access code',
        'auth.submit': 'Submit',
        'auth.error': 'Invalid access code',
        'credits.cost': 'Cost:',
        'credits.unit': 'credits',
        'credits.insufficient': 'Insufficient credits. Please upgrade your plan.',
        'plans.title': 'Subscription Plans',
        'plans.current': 'Current Plan',
        'plans.upgrade': 'Upgrade',
        'plans.perMonth': '/month',
        'plans.creditsPerMonth': 'credits/month',
        'edit.upload': 'Click to upload or drag image here',
        'edit.hint': 'JPG, PNG, WEBP · Max 20MB',
        'edit.remove': 'Remove',
        'edit.label': 'Edit Instructions',
        'edit.placeholder': 'Describe how you want to edit the image...\n\nExample: Replace the background with a quiet coastal cliff at overcast sunset. Remove all buildings and streets. Add wind-shaped grass and a distant ocean horizon. Keep the subject\'s pose and framing unchanged.',
        'edit.button': 'Edit Image',
        'edit.processing': 'Processing...',
        'generate.label': 'Image Description',
        'generate.placeholder': 'Describe the image you want to generate...\n\nExample: A serene mountain landscape at dawn, misty valleys, golden sunlight piercing through clouds, photorealistic, 8k quality',
        'generate.template.selfie': 'Casual Selfie',
        'generate.template.desk': 'Office Desk',
        'generate.template.coffee': 'Coffee Table',
        'generate.template.kitchen': 'Kitchen',
        'generate.template.bedroom': 'Bedroom',
        'generate.template.outdoor': 'Outdoor',
        'generate.template.luxury': 'Luxury',
        'generate.template.portrait': 'Portrait',
        'generate.template.nature': 'Nature',
        'generate.width': 'Width',
        'generate.height': 'Height',
        'generate.steps': 'Steps',
        'generate.cfg': 'CFG',
        'generate.gridMode': 'Grid Mode (4 GPU Parallel)',
        'generate.button': 'Generate Image',
        'generate.generating': 'Generating...',
        'result.title': 'Result',
        'result.download': 'Download',
        'result.saveToAlbum': 'Save to Album',
        'result.saved': 'Successfully saved to album',
        'result.saveFailed': 'Failed to save. Please try long-pressing the image to save.',
        'error.noImage': 'Please select an image file',
        'error.fileSize': 'File size must be less than 20MB',
        'error.noPrompt': 'Please enter a description',
        'error.invalidSize': 'Width and height must be between 256 and 2048',
        'error.invalidSteps': 'Steps must be between 1 and 50',
        'nav.home': 'Home',
        'nav.editor': 'Create',
        'nav.history': 'History',
        'nav.settings': 'Settings',
        'home.card.style.title': 'Stylized edit',
        'home.card.style.desc': 'Natural language + Flux2 workflow',
        'home.card.upscale.title': 'HD enhance',
        'home.card.upscale.desc': 'Server: lanczos upscale, ~2.25MP, 12 Flux2 steps (not prompt-only)',
        'home.card.bg.title': 'Background repaint',
        'home.card.bg.desc': 'Server: higher CFG + 8 steps; pair with background-style prompts',
        'home.card.history.title': 'History',
        'home.card.history.desc': 'Saved in this browser; replay without GPU',
        'home.card.settings.title': 'Settings',
        'home.card.settings.desc': 'Health & version',
        'edit.samples': 'Sample images',
        'edit.sampleWarm': 'Warm gradient',
        'edit.sampleCool': 'Cool gradient',
        'edit.sampleNeutral': 'Neutral gray',
        'edit.negativeLabel': 'Exclude (optional)',
        'edit.negativePlaceholder': 'e.g. extra fingers, watermark, text',
        'edit.negativeHint': 'Sent as an exclusion hint appended to your prompt.',
        'compare.before': 'Before',
        'compare.after': 'After',
        'result.regenerate': 'Generate again',
        'task.cancel': 'Cancel',
        'task.timeout': 'Task timed out. Please retry or check History.',
        'task.cancelled': 'Cancelled',
        'history.title': 'History',
        'history.hint': 'Stored in this browser only.',
        'history.empty': 'No completed tasks yet.',
        'history.detailTitle': 'Task detail',
        'history.openEditor': 'Open in editor',
        'history.close': 'Close',
        'settings.healthTitle': 'Connectivity',
        'settings.healthDesc': 'Checks this web service and ComfyUI (server-side).',
        'settings.refreshHealth': 'Run health check',
        'settings.versionTitle': 'Version',
        'settings.archTitle': 'Architecture',
        'settings.archBody': 'The browser only calls this Node service. ComfyUI is reached server-side.',
        'settings.demoTitle': 'Demo fallback',
        'settings.demoBody': 'Use History to replay past successful outputs when GPU is offline.',
        'settings.dataTitle': 'Local data',
        'settings.clearHistory': 'Clear all history',
        'editor.mode.style':
            '当前：风格化 · ComfyUI ~1MP、4 步、nearest 缩放 · 提交模板 img2img_style',
        'editor.mode.upscale':
            '当前：高清增强 · lanczos + ~2.25MP、12 步（更慢、更吃显存）· 提交模板 image_upscale',
        'editor.mode.background':
            '当前：背景重绘 · CFG 1.22、8 步 · 提交模板 background_repaint（请配合背景类描述）',
        'footer.terms': 'Terms of Service',
        'footer.privacy': 'Privacy Policy',
        'footer.icp':
            'Operator: 北京刻熵科技有限责任公司 · Contact: 24373054@buaa.edu.cn',
        'footer.copyPrefix': '©',
        'footer.brand': 'ImageForge',
        'footer.tagline': 'Image editing & generation'
    },
    zh: {
        title: 'ImageForge Web',
        'status.checking': '检查中...',
        'status.ready': '就绪',
        'status.offline': '离线',
        'tabs.edit': '编辑图片',
        'tabs.generate': '生成图片',
        'auth.title': '需要访问码',
        'auth.description': '请输入内测访问码以继续',
        'auth.placeholder': '输入访问码',
        'auth.submit': '提交',
        'auth.error': '访问码无效',
        'credits.cost': '消耗：',
        'credits.unit': '积分',
        'credits.insufficient': '积分不足，请升级订阅方案',
        'plans.title': '订阅方案',
        'plans.current': '当前方案',
        'plans.upgrade': '升级',
        'plans.perMonth': '/月',
        'plans.creditsPerMonth': '积分/月',
        'edit.upload': '点击上传或拖拽图片到此处',
        'edit.hint': 'JPG, PNG, WEBP · 最大 20MB',
        'edit.remove': '移除',
        'edit.label': '编辑指令',
        'edit.placeholder': '描述你想如何编辑图片...\n\n示例：将背景替换为阴天日落时的宁静海岸悬崖。移除所有建筑和街道。添加被风吹动的草和远处的海平线。保持主体的姿势和构图不变。',
        'edit.button': '编辑图片',
        'edit.processing': '处理中...',
        'generate.label': '图片描述',
        'generate.placeholder': '描述你想生成的图片...\n\n示例：黎明时分宁静的山景，薄雾笼罩的山谷，金色阳光穿透云层，照片级真实感，8k画质',
        'generate.template.selfie': '随手自拍',
        'generate.template.desk': '办公桌',
        'generate.template.coffee': '咖啡桌',
        'generate.template.kitchen': '厨房',
        'generate.template.bedroom': '卧室',
        'generate.template.outdoor': '户外',
        'generate.template.luxury': '奢华',
        'generate.template.portrait': '人像',
        'generate.template.nature': '自然',
        'generate.width': '宽度',
        'generate.height': '高度',
        'generate.steps': '步数',
        'generate.cfg': 'CFG',
        'generate.gridMode': '四宫格模式 (4 GPU并行)',
        'generate.button': '生成图片',
        'generate.generating': '生成中...',
        'result.title': '结果',
        'result.download': '下载',
        'result.saveToAlbum': '保存到相册',
        'result.saved': '已成功保存至相册',
        'result.saveFailed': '保存失败，请长按图片保存',
        'error.noImage': '请选择图片文件',
        'error.fileSize': '文件大小必须小于 20MB',
        'error.noPrompt': '请输入描述',
        'error.invalidSize': '宽度和高度必须在 256 到 2048 之间',
        'error.invalidSteps': '步数必须在 1 到 50 之间',
        'nav.home': '首页',
        'nav.editor': '创作',
        'nav.history': '历史',
        'nav.settings': '设置',
        'home.card.style.title': '风格化修图',
        'home.card.style.desc': '自然语言编辑 + Flux2 工作流',
        'home.card.upscale.title': '高清增强',
        'home.card.upscale.desc': '服务端：lanczos 放大 + 约 2.25MP、12 步 Flux2（非仅提示词）',
        'home.card.bg.title': '背景重绘',
        'home.card.bg.desc': '服务端：提高 CFG + 8 步，请配合背景类描述',
        'home.card.history.title': '历史记录',
        'home.card.history.desc': '本机保存的成功任务，无 GPU 也可回看',
        'home.card.settings.title': '服务设置',
        'home.card.settings.desc': '健康检查与版本',
        'edit.samples': '样例图',
        'edit.sampleWarm': '暖色渐变',
        'edit.sampleCool': '冷色渐变',
        'edit.sampleNeutral': '中性灰',
        'edit.negativeLabel': '排除内容（可选）',
        'edit.negativePlaceholder': '例如：多余手指、水印、文字',
        'edit.negativeHint': '将作为排除说明附加在提示词后发送给模型。',
        'compare.before': '原图',
        'compare.after': '结果',
        'result.regenerate': '再次生成',
        'task.cancel': '取消',
        'task.timeout': '任务超时，请重试或查看历史记录。',
        'task.cancelled': '已取消',
        'history.title': '历史记录',
        'history.hint': '仅保存在本浏览器。',
        'history.empty': '暂无已完成任务。',
        'history.detailTitle': '任务详情',
        'history.openEditor': '在创作中打开',
        'history.close': '关闭',
        'settings.healthTitle': '连通性',
        'settings.healthDesc': '检测本 Web 服务与 ComfyUI（服务端转发）。',
        'settings.refreshHealth': '执行健康检查',
        'settings.versionTitle': '版本信息',
        'settings.archTitle': '架构说明',
        'settings.archBody': '浏览器只访问本 Node 服务；ComfyUI 由服务端连接，可与鸿蒙端对齐同一套 API。',
        'settings.demoTitle': '演示兜底',
        'settings.demoBody': 'GPU 不可用时，用历史记录回看已成功输出。',
        'settings.dataTitle': '本地数据',
        'settings.clearHistory': '清空全部历史',
        'editor.mode.style':
            '当前：风格化 · ComfyUI 约 1MP、4 步、nearest 缩放 · 提交模板 img2img_style',
        'editor.mode.upscale':
            '当前：高清增强 · lanczos + 约 2.25MP、12 步（更慢、更吃显存）· 提交模板 image_upscale',
        'editor.mode.background':
            '当前：背景重绘 · CFG 1.22、8 步 · 提交模板 background_repaint（请配合背景类描述）',
        'footer.terms': '服务条款',
        'footer.privacy': '隐私政策',
        'footer.icp':
            '主办单位：北京刻熵科技有限责任公司 · 联系邮箱：24373054@buaa.edu.cn',
        'footer.copyPrefix': '©',
        'footer.brand': 'ImageForge',
        'footer.tagline': '图像编辑与生成服务'
    }
};

function absUrl(rel) {
    if (!rel) return '';
    if (rel.startsWith('http')) return rel;
    return new URL(rel, window.location.origin).href;
}

function readHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}

function writeHistory(arr) {
    localStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(arr.slice(0, HISTORY_LIMIT))
    );
}

function showForgePage(page) {
    const map = {
        home: 'pageHome',
        editor: 'pageEditor',
        history: 'pageHistory',
        settings: 'pageSettings'
    };
    document.querySelectorAll('.forge-page').forEach((el) => el.classList.add('hidden'));
    const id = map[page];
    if (id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }
    if (forgeNav) {
        forgeNav.querySelectorAll('button').forEach((b) => {
            b.classList.toggle('active', b.dataset.page === page);
        });
    }
    if (page === 'history') renderHistoryList();
    if (page === 'settings') loadSettingsPanel();
    if (page === 'editor' && editMode && editMode.classList.contains('active')) {
        updateEditModeBanner();
    }
}

/** 创作页顶部：标明当前 workflowTemplate 与 Comfy 侧真实差异（样式统一为中性材质） */
function updateEditModeBanner() {
    const el = document.getElementById('editModeBanner');
    if (!el) return;
    const mode =
        editIntentTask === 'upscale'
            ? 'upscale'
            : editIntentTask === 'background'
              ? 'background'
              : 'style';
    const key =
        mode === 'upscale'
            ? 'editor.mode.upscale'
            : mode === 'background'
              ? 'editor.mode.background'
              : 'editor.mode.style';
    el.textContent = i18n[currentLang][key] || '';
}

function applyHomeTaskIntent(task) {
    editIntentTask = task || 'style';
    if (forgePresets && forgePresets.editPresets) {
        const langKey = currentLang === 'zh' ? 'zh' : 'en';
        const ep = forgePresets.editPresets;
        let extra = '';
        if (task === 'upscale' && ep.upscale_main)
            extra = ep.upscale_main.prompt[langKey] || '';
        else if (task === 'background' && ep.background_main)
            extra = ep.background_main.prompt[langKey] || '';
        if (extra) {
            const cur = promptInput.value.trim();
            promptInput.value = cur ? `${cur}\n${extra}` : extra;
        }
    }
    updateEditModeBanner();
}

function buildEditPromptForRequest() {
    let t = promptInput.value.trim();
    const neg = negativePrompt && negativePrompt.value ? negativePrompt.value.trim() : '';
    if (neg) {
        t +=
            currentLang === 'zh'
                ? `\n\n（请避免出现或弱化：${neg}）`
                : `\n\n(Avoid or de-emphasize: ${neg})`;
    }
    return t;
}

function resetResultPresentation() {
    if (resultMetaSummary) {
        resultMetaSummary.classList.add('hidden');
        resultMetaSummary.textContent = '';
    }
    if (compareBox) compareBox.classList.add('hidden');
    compareBeforeDataUrl = null;
    currentOriginalImage = null;
}

function setResultMeta(lines) {
    if (!resultMetaSummary) return;
    resultMetaSummary.textContent = lines.filter(Boolean).join('\n');
    resultMetaSummary.classList.remove('hidden');
}

function setCompareAfterEdit(beforeDataUrl, outThumbOrUrl, outFullUrl) {
    if (!compareBox || !compareImgBefore || !compareImgAfter) return;
    if (beforeDataUrl && outThumbOrUrl) {
        compareImgBefore.src = beforeDataUrl;
        compareImgAfter.src = absUrl(outThumbOrUrl);
        compareBox.classList.remove('hidden');
    } else {
        compareBox.classList.add('hidden');
    }
}

async function registerHistoryEntry(entry) {
    const arr = readHistory();
    arr.unshift(entry);
    writeHistory(arr);
}

function renderHistoryList() {
    if (!historyList || !historyEmpty) return;
    const arr = readHistory().filter((x) => x.status === 'done');
    historyList.innerHTML = '';
    if (!arr.length) {
        historyEmpty.classList.remove('hidden');
        return;
    }
    historyEmpty.classList.add('hidden');
    arr.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'history-card';
        const thumb = document.createElement('img');
        thumb.src = absUrl(item.thumbRel || item.outRel);
        thumb.alt = '';
        const body = document.createElement('div');
        body.className = 'hc-body';
        const l1 = document.createElement('div');
        l1.className = 'hc-line1';
        l1.textContent = item.prompt || item.taskType || '—';
        const l2 = document.createElement('div');
        l2.className = 'hc-line2';
        l2.textContent = `${item.mode || ''} · ${item.taskType || ''} · ${item.at || ''}`;
        body.appendChild(l1);
        body.appendChild(l2);
        card.appendChild(thumb);
        card.appendChild(body);
        card.addEventListener('click', () => openHistoryModal(item));
        historyList.appendChild(card);
    });
}

let historyModalItem = null;

function openHistoryModal(item) {
    historyModalItem = item;
    if (!historyModal) return;
    historyModal.classList.remove('hidden');
    historyModalMeta.textContent = [
        `mode: ${item.mode}`,
        `task: ${item.taskType}`,
        `at: ${item.at}`,
        `prompt: ${item.prompt || '—'}`,
        item.params && Object.keys(item.params).length
            ? `params: ${JSON.stringify(item.params)}`
            : ''
    ]
        .filter(Boolean)
        .join('\n');
    const afterSrc = absUrl(item.outRel);
    historyModalAfter.src = afterSrc;
    const colBefore =
        historyModalBefore && historyModalBefore.closest('.compare-col');
    if (item.inThumbDataUrl && colBefore) {
        historyModalBefore.src = item.inThumbDataUrl;
        colBefore.style.display = '';
    } else if (colBefore) {
        historyModalBefore.removeAttribute('src');
        colBefore.style.display = 'none';
    }
}

function closeHistoryModal() {
    if (historyModal) historyModal.classList.add('hidden');
    historyModalItem = null;
}

async function loadForgePresets() {
    try {
        const r = await fetch(apiUrl('/api/presets'));
        if (r.ok) forgePresets = await r.json();
    } catch (_) {
        forgePresets = null;
    }
    renderEditPresetChips();
}

function renderEditPresetChips() {
    if (!editPresetBar) return;
    editPresetBar.innerHTML = '';
    if (!forgePresets || !forgePresets.editPresets) return;
    const langKey = currentLang === 'zh' ? 'zh' : 'en';
    const keys = ['style_portrait', 'style_vintage', 'style_id'];
    keys.forEach((key) => {
        const def = forgePresets.editPresets[key];
        if (!def) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-chip';
        btn.textContent = def.name[langKey] || def.name.en || key;
        btn.addEventListener('click', () => {
            const p = def.prompt[langKey] || def.prompt.en;
            const cur = promptInput.value.trim();
            promptInput.value = cur ? `${cur}\n${p}` : p;
            updateEditButton();
        });
        editPresetBar.appendChild(btn);
    });
}

function createSampleFile(kind) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    let grd;
    if (kind === 'warm')
        grd = g.createLinearGradient(0, 0, c.width, c.height);
    else if (kind === 'cool')
        grd = g.createLinearGradient(0, 0, c.width, c.height);
    else grd = g.createLinearGradient(0, 0, c.width, c.height);
    if (kind === 'warm') {
        grd.addColorStop(0, '#f8e8c8');
        grd.addColorStop(1, '#c87850');
    } else if (kind === 'cool') {
        grd.addColorStop(0, '#c8e8ff');
        grd.addColorStop(1, '#3050a0');
    } else {
        grd.addColorStop(0, '#e8e8e8');
        grd.addColorStop(1, '#888888');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.font = '22px sans-serif';
    g.fillText('Sample', 24, 48);
    return new Promise((resolve) => {
        c.toBlob(
            (blob) => {
                if (!blob) return resolve(null);
                resolve(
                    new File([blob], `sample-${kind}.png`, { type: 'image/png' })
                );
            },
            'image/png',
            0.92
        );
    });
}

async function loadSettingsPanel() {
    if (!settingsVersionOut) return;
    try {
        const url = apiUrl('/api/version');
        const r = await fetch(url);
        if (r.ok) {
            const j = await r.json();
            settingsVersionOut.textContent = JSON.stringify(j, null, 2);
            return;
        }
        const body = await r.text();
        const isExpressCannotGet =
            typeof body === 'string' && body.includes('Cannot GET /api/version');

        const fbUrl = apiUrl(`/version-info.json?t=${Date.now()}`);
        try {
            const fr = await fetch(fbUrl);
            if (fr.ok) {
                const j = await fr.json();
                settingsVersionOut.textContent = JSON.stringify(
                    {
                        ...j,
                        _note:
                            (isExpressCannotGet
                                ? '当前域名已打到 Express，但进程内未注册 GET /api/version（多为旧版 server.js）。请把本仓库最新 server.js 部署到 ptp.matrixlabs.cn 所用 Node 并重启。'
                                : `GET /api/version 返回 HTTP ${r.status}。`) +
                            ' 以下为 /version-info.json 回退（由新版 server 启动时写入；若仍缺字段请确认已部署并重启）。'
                    },
                    null,
                    2
                );
                return;
            }
        } catch (_) {
            /* no fallback file */
        }

        let parsed = null;
        try {
            parsed = JSON.parse(body);
        } catch (_) {
            /* ignore */
        }
        const payload = {
            error: r.status,
            url,
            apiBase: getPtpApiBase() || '(同源，未设置 ptp-api-base)',
            hint: isExpressCannotGet
                ? 'Express 返回 Cannot GET /api/version：线上 Node 仍是旧构建。请同步部署含靠前注册的 app.get("/api/version") 的 server.js，或确保 Nginx 将 /api 指向该进程。'
                : r.status === 404
                  ? '404：未找到版本接口。请用最新 server.js 启动 BFF，或在 meta ptp-api-base 指向正确 BFF。'
                  : '版本接口返回非成功状态。'
        };
        if (parsed && typeof parsed === 'object') {
            payload.response = parsed;
        } else if (body) {
            payload.responseBodyPreview = body.slice(0, 500);
        }
        settingsVersionOut.textContent = JSON.stringify(payload, null, 2);
    } catch (e) {
        settingsVersionOut.textContent = String(e.message || e);
    }
}

async function runHealthToPanel() {
    if (!settingsHealthOut) return;
    settingsHealthOut.textContent = '…';
    try {
        const r = await fetch(apiUrl('/api/health'));
        const j = await r.json();
        settingsHealthOut.textContent = JSON.stringify(j, null, 2);
    } catch (e) {
        settingsHealthOut.textContent = String(e.message || e);
    }
}

async function consumeSseStream(response, onData, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));
            await onData(data);
        }
    }
}

function shrinkDataUrl(dataUrl, maxW = 320) {
    return new Promise((resolve) => {
        if (!dataUrl || !dataUrl.startsWith('data:')) return resolve(null);
        const im = new Image();
        im.onload = () => {
            try {
                const c = document.createElement('canvas');
                const w = Math.min(maxW, im.width);
                const h = Math.round((im.height * w) / im.width) || 1;
                c.width = w;
                c.height = h;
                c.getContext('2d').drawImage(im, 0, 0, w, h);
                resolve(c.toDataURL('image/jpeg', 0.72));
            } catch (_) {
                resolve(null);
            }
        };
        im.onerror = () => resolve(null);
        im.src = dataUrl;
    });
}

// 切换语言
function switchLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('preferred_lang', lang);
    
    // 更新所有带 data-i18n 的元素
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) {
            el.textContent = i18n[lang][key];
        }
    });
    
    // 更新所有带 data-i18n-placeholder 的元素
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (i18n[lang][key]) {
            el.placeholder = i18n[lang][key];
        }
    });
    
    // 更新语言切换按钮文本
    const langSwitch = document.getElementById('langSwitch');
    langSwitch.querySelector('.lang-text').textContent = lang === 'en' ? '中文' : 'English';
    
    // 更新下载按钮文本（移动端显示"保存到相册"）
    updateDownloadButtonText();
    
    // 更新状态文本
    if (status.classList.contains('online')) {
        status.querySelector('.text').textContent = i18n[lang]['status.ready'];
    } else if (status.classList.contains('offline')) {
        status.querySelector('.text').textContent = i18n[lang]['status.offline'];
    }
    
    // 重新加载订阅方案（使用新语言）
    if (currentUser) {
        loadPlans();
        // 更新按钮上的积分单位
        updateUserInfo();
    }
    renderEditPresetChips();
    if (typeof editMode !== 'undefined' && editMode.classList.contains('active')) {
        updateEditModeBanner();
    }
}

// 更新下载按钮文本
function updateDownloadButtonText() {
    const downloadText = document.querySelector('.download-text');
    if (downloadText) {
        if (isMobile) {
            downloadText.textContent = i18n[currentLang]['result.saveToAlbum'];
        } else {
            downloadText.textContent = i18n[currentLang]['result.download'];
        }
    }
}

// 初始化语言
const savedLang = localStorage.getItem('preferred_lang') || 'en';
currentLang = savedLang;

// 内测码验证
const AUTH_KEY = 'ptp_auth_token';

function checkAuth() {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token) {
        currentAccessCode = token;
        return authenticateUser(token);
    }
    return false;
}

// 用户认证
async function authenticateUser(accessCode) {
    try {
        const response = await fetch(apiUrl('/api/auth'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accessCode })
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            currentAccessCode = accessCode;
            updateUserInfo();
            authOverlay.classList.add('hidden');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Authentication failed:', error);
        return false;
    }
}

// 更新用户信息显示
function updateUserInfo() {
    if (!currentUser) return;
    
    userName.textContent = currentUser.username;
    userPlan.textContent = currentUser.planName;
    creditsCount.textContent = currentUser.credits;
    
    // 显示用户信息
    userInfo.classList.remove('hidden');
    
    // 更新按钮上的积分消耗显示
    if (currentUser.creditCost) {
        const creditUnit = currentLang === 'zh' ? '积分' : 'credits';
        
        // Beta用户或免费用户不显示积分消耗
        if (currentUser.plan === 'beta' || currentUser.creditCost.edit === 0) {
            editBtnCredit.classList.add('hidden');
            generateBtnCredit.classList.add('hidden');
        } else {
            editBtnCredit.textContent = `~ ${currentUser.creditCost.edit} ${creditUnit}`;
            generateBtnCredit.textContent = `~ ${currentUser.creditCost.generate} ${creditUnit}`;
            editBtnCredit.classList.remove('hidden');
            generateBtnCredit.classList.remove('hidden');
        }
    }
}

// 加载订阅方案
async function loadPlans() {
    try {
        const response = await fetch(apiUrl(`/api/plans?lang=${currentLang}`));
        const data = await response.json();
        
        if (data.plans) {
            renderPlans(data.plans);
        }
    } catch (error) {
        console.error('Failed to load plans:', error);
    }
}

// 渲染订阅方案
function renderPlans(plans) {
    plansGrid.innerHTML = '';
    
    plans.forEach(plan => {
        const planCard = document.createElement('div');
        planCard.className = 'plan-card';
        
        if (currentUser && currentUser.plan === plan.id) {
            planCard.classList.add('current');
        }
        
        const isCurrent = currentUser && currentUser.plan === plan.id;
        const editLabel = currentLang === 'zh' ? '编辑' : 'Edit';
        const generateLabel = currentLang === 'zh' ? '生成' : 'Generate';
        
        planCard.innerHTML = `
            <div class="plan-header">
                <h3>${plan.name}</h3>
                <div class="plan-price">
                    <span class="price">$${plan.price}</span>
                    <span class="period">${i18n[currentLang]['plans.perMonth']}</span>
                </div>
            </div>
            <div class="plan-credits">
                <span class="credits-amount">${plan.credits}</span>
                <span>${i18n[currentLang]['plans.creditsPerMonth']}</span>
            </div>
            <div class="plan-cost">
                <span>${editLabel}: ${plan.creditCost.edit} ${i18n[currentLang]['credits.unit']}</span>
                <span>${generateLabel}: ${plan.creditCost.generate} ${i18n[currentLang]['credits.unit']}</span>
            </div>
            <ul class="plan-features">
                ${plan.features.map(f => `<li>${f}</li>`).join('')}
            </ul>
            <button class="plan-btn ${isCurrent ? 'current' : ''}" 
                    ${isCurrent ? 'disabled' : ''}>
                ${isCurrent ? i18n[currentLang]['plans.current'] : i18n[currentLang]['plans.upgrade']}
            </button>
        `;
        
        plansGrid.appendChild(planCard);
    });
    
    plansSection.classList.remove('hidden');
}

submitCodeBtn.addEventListener('click', async () => {
    const code = accessCodeInput.value.trim();
    if (!code) {
        errorMessage.classList.remove('hidden');
        return;
    }
    
    const success = await authenticateUser(code);
    if (success) {
        sessionStorage.setItem(AUTH_KEY, code);
        errorMessage.classList.add('hidden');
        checkHealth();
        loadPlans();
        loadForgePresets();
    } else {
        errorMessage.classList.remove('hidden');
        accessCodeInput.value = '';
        accessCodeInput.focus();
    }
});

accessCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        submitCodeBtn.click();
    }
});

// 页面加载时检查认证
if (!checkAuth()) {
    accessCodeInput.focus();
} else {
    checkHealth();
    loadPlans();
    loadForgePresets();
}

// 语言切换
document.getElementById('langSwitch').addEventListener('click', () => {
    const newLang = currentLang === 'en' ? 'zh' : 'en';
    switchLanguage(newLang);
});

// 初始化语言
switchLanguage(currentLang);

const footerYearEl = document.getElementById('footerYear');
if (footerYearEl) footerYearEl.textContent = String(new Date().getFullYear());

// Mode switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        
        // Update tabs
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        if (mode === 'edit') {
            editMode.classList.add('active');
            generateMode.classList.remove('active');
            currentMode = 'edit';
            updateEditModeBanner();
        } else {
            editMode.classList.remove('active');
            generateMode.classList.add('active');
            currentMode = 'generate';
        }
        
        // Hide result when switching modes
        resultSection.classList.add('hidden');
    });
});

// Prompt templates
const promptTemplates = {
    en: {
        selfie: "A casual selfie of a beautiful young woman, taken with a smartphone camera. The photo appears accidental and spontaneous, as if the phone was pulled from a pocket and the shutter was pressed by mistake. Chaotic composition with no clear subject focus, off-center framing, slightly blurred. The image has an authentic, unpolished quality - natural lighting, no posing, capturing a genuine moment. Realistic photography style, amateur snapshot aesthetic, candid and unintentional feel.",
        desk: "Modern minimalist office desk setup, clean wooden table surface, soft natural lighting from window, professional workspace background, high detail product photography, neutral colors, organized and elegant, perfect for keyboards, mouse, headphones, monitors, stationery products",
        coffee: "Coffee shop table scene, warm ambient lighting, rustic wood texture, cozy cafe atmosphere, soft bokeh background, perfect for coffee cups, desserts, mugs, beverages, product photography background, inviting and comfortable feel",
        kitchen: "Modern kitchen counter, clean marble or granite surface, soft sunlight streaming through, bright and airy atmosphere, minimalist style, perfect for cookware, utensils, cups, kitchen appliances, product photography background, professional and clean",
        bedroom: "Luxury bedroom table or nightstand, soft diffused lighting, elegant and sophisticated atmosphere, high-end interior design, perfect for perfume, jewelry, watches, cosmetics, product photography background, refined and upscale feel",
        outdoor: "Outdoor camping or nature table setup, sunset golden hour lighting, natural environment, adventure atmosphere, wooden picnic table or camping gear layout, perfect for backpacks, water bottles, camping equipment, outdoor gear, product photography background",
        luxury: "High-end luxury table setting, premium materials like marble or velvet, dramatic lighting with soft shadows, elegant and sophisticated, perfect for luxury watches, jewelry, high-end accessories, premium product photography background, exclusive and refined atmosphere",
        portrait: "Professional portrait photography, beautiful young woman, natural soft lighting, shallow depth of field, bokeh background, elegant and refined, fashion photography style, high-end beauty shot, professional studio quality, cinematic color grading",
        nature: "Breathtaking natural landscape, majestic mountains or serene forest, golden hour lighting, dramatic sky with clouds, pristine wilderness, epic vista, nature photography, high detail, cinematic composition, peaceful and awe-inspiring atmosphere"
    },
    zh: {
        selfie: "小爱，你陪我这么长时间了，我想看看你的样子（希望你是一个漂亮的女孩子），请生成一张类似你自己的自拍照，没有明确的主体或构图，就像随手一拍的快照，构图混乱，整体呈现出一种随意的平庸感，就像从口袋里拿手机时，不小心拍到的一张自拍照",
        desk: "现代简约办公桌场景，干净的木质桌面，柔和的自然光从窗户照入，专业的工作空间背景，高细节产品摄影，中性色调，整洁优雅，适合键盘、鼠标、耳机、显示器、文具等产品展示",
        coffee: "咖啡馆桌面场景，温暖的环境光，质朴的木质纹理，舒适的咖啡馆氛围，柔和的背景虚化，适合咖啡杯、甜品、马克杯、饮品等产品展示，温馨舒适的感觉",
        kitchen: "现代厨房台面，干净的大理石或花岗岩表面，柔和的阳光洒入，明亮通透的氛围，简约风格，适合锅具、餐具、杯子、厨房电器等产品展示，专业整洁",
        bedroom: "奢华卧室桌面或床头柜，柔和的漫射光线，优雅精致的氛围，高端室内设计，适合香水、首饰、手表、化妆品等产品展示，精致高档的感觉",
        outdoor: "户外露营或自然桌面场景，日落黄金时刻光线，自然环境，冒险氛围，木质野餐桌或露营装备布局，适合背包、水壶、露营装备、户外用品等产品展示",
        luxury: "高端奢华桌面场景，大理石或天鹅绒等高级材质，戏剧性光线配合柔和阴影，优雅精致，适合奢侈手表、珠宝、高端配饰等产品展示，尊贵精致的氛围",
        portrait: "专业人像摄影，美丽的年轻女性，自然柔和的光线，浅景深，背景虚化，优雅精致，时尚摄影风格，高端美妆大片，专业影棚品质，电影级调色",
        nature: "令人惊叹的自然风光，雄伟的山脉或宁静的森林，黄金时刻光线，戏剧性的云彩天空，原始荒野，史诗般的远景，自然摄影，高细节，电影级构图，宁静而震撼的氛围"
    }
};

document.querySelectorAll('.template-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const template = btn.dataset.template;
        if (promptTemplates[currentLang] && promptTemplates[currentLang][template]) {
            generatePrompt.value = promptTemplates[currentLang][template];
            generatePrompt.focus();
            
            // Add a subtle animation
            generatePrompt.style.backgroundColor = '#f0f0f0';
            setTimeout(() => {
                generatePrompt.style.backgroundColor = '';
            }, 300);
        }
    });
});

// Check server health
async function checkHealth() {
    try {
        const response = await fetch(apiUrl('/api/health'));
        const data = await response.json();
        
        if (data.status === 'ok') {
            status.classList.add('online');
            status.classList.remove('offline');
            status.querySelector('.text').textContent = i18n[currentLang]['status.ready'];
        } else {
            throw new Error('Service unavailable');
        }
    } catch (error) {
        status.classList.add('offline');
        status.classList.remove('online');
        status.querySelector('.text').textContent = i18n[currentLang]['status.offline'];
    }
}

// File upload handlers
uploadArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    }
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showAlert(i18n[currentLang]['error.noImage']);
        return;
    }
    
    if (file.size > 20 * 1024 * 1024) {
        showAlert(i18n[currentLang]['error.fileSize']);
        return;
    }
    
    selectedFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        uploadArea.classList.add('hidden');
        previewArea.classList.remove('hidden');
        updateEditButton();
    };
    reader.readAsDataURL(file);
}

removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    uploadArea.classList.remove('hidden');
    previewArea.classList.add('hidden');
    resultSection.classList.add('hidden');
    resetResultPresentation();
    updateEditButton();
});

// Prompt input
promptInput.addEventListener('input', updateEditButton);
if (negativePrompt) negativePrompt.addEventListener('input', updateEditButton);

function updateEditButton() {
    const hasFile = selectedFile !== null;
    const hasPrompt = promptInput.value.trim() !== '';
    editBtn.disabled = !(hasFile && hasPrompt);
}

// Edit image
editBtn.addEventListener('click', async () => {
    if (!selectedFile || !promptInput.value.trim()) return;

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('prompt', buildEditPromptForRequest());
    formData.append('accessCode', currentAccessCode);
    formData.append(
        'workflowTemplate',
        EDIT_WORKFLOW_TEMPLATE[editIntentTask] || 'img2img_style'
    );

    compareBeforeDataUrl = previewImage.src || null;

    editBtn.disabled = true;
    editBtn.querySelector('.btn-text').classList.add('hidden');
    editBtn.querySelector('.btn-loading').classList.remove('hidden');

    showLoadingProgress();

    activeAbortController = new AbortController();
    const tm = setTimeout(() => {
        try {
            activeAbortController.abort();
        } catch (_) {}
    }, TASK_CLIENT_TIMEOUT_MS);

    try {
        const response = await fetch(apiUrl('/api/edit-stream'), {
            method: 'POST',
            body: formData,
            signal: activeAbortController.signal
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            if (response.status === 402) {
                throw new Error(i18n[currentLang]['credits.insufficient']);
            }
            throw new Error(errBody.error || 'Failed to process image');
        }

        let finalResult = null;
        await consumeSseStream(
            response,
            async (data) => {
                if (data.progress !== undefined) updateRealProgress(data.progress);
                if (data.status === 'completed' && data.result) {
                    finalResult = data.result;
                    if (data.result.creditsRemaining !== undefined && creditsCount) {
                        creditsCount.textContent = data.result.creditsRemaining;
                        currentUser.credits = data.result.creditsRemaining;
                    }
                }
                if (data.status === 'error') {
                    throw new Error(data.error || 'Failed to process image');
                }
            },
            activeAbortController.signal
        );

        if (!finalResult) throw new Error('No result');

        resultImage.src = finalResult.thumbnail || finalResult.image;
        currentOriginalImage = finalResult.image;

        lastResultSummary = {
            mode: 'edit',
            taskType: editIntentTask,
            prompt: buildEditPromptForRequest(),
            neg: negativePrompt ? negativePrompt.value.trim() : ''
        };
        setResultMeta([
            `${currentLang === 'zh' ? '模式' : 'Mode'}: edit · ${editIntentTask}`,
            `workflowTemplate: ${EDIT_WORKFLOW_TEMPLATE[editIntentTask] || 'img2img_style'}`,
            `${currentLang === 'zh' ? '提示' : 'Prompt'}: ${promptInput.value.trim().slice(0, 400)}${
                promptInput.value.trim().length > 400 ? '…' : ''
            }`
        ]);
        setCompareAfterEdit(
            compareBeforeDataUrl,
            finalResult.thumbnail || finalResult.image,
            finalResult.image
        );

        hideLoadingProgress();
        updateDownloadButtonText();
        resultSection.classList.remove('hidden');
        showForgePage('editor');
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        const inThumb = await shrinkDataUrl(compareBeforeDataUrl);
        await registerHistoryEntry({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            mode: 'edit',
            taskType: editIntentTask,
            prompt: promptInput.value.trim(),
            params: {
                negative: lastResultSummary.neg || '',
                workflowTemplate:
                    EDIT_WORKFLOW_TEMPLATE[editIntentTask] || 'img2img_style'
            },
            outRel: finalResult.image,
            thumbRel: finalResult.thumbnail || finalResult.image,
            inThumbDataUrl: inThumb,
            status: 'done',
            err: null
        });
    } catch (error) {
        hideLoadingProgress();
        resultSection.classList.add('hidden');
        if (forgeUserCancelled) {
            showAlert(i18n[currentLang]['task.cancelled']);
        } else if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
            showAlert(i18n[currentLang]['task.timeout']);
        } else {
            showAlert(`Error: ${error.message}`);
        }
    } finally {
        forgeUserCancelled = false;
        clearTimeout(tm);
        activeAbortController = null;
        editBtn.disabled = false;
        editBtn.querySelector('.btn-text').classList.remove('hidden');
        editBtn.querySelector('.btn-loading').classList.add('hidden');
    }
});

// Download result
downloadBtn.addEventListener('click', async () => {
    if (isMobile) {
        // 移动端：保存到相册（使用原图）
        await saveToAlbum();
    } else {
        // PC端：直接下载原图
        const link = document.createElement('a');
        link.href = currentOriginalImage || resultImage.src;
        link.download = `${currentMode}-${Date.now()}.png`;
        link.click();
    }
});

// 保存图片到相册（移动端）
async function saveToAlbum() {
    try {
        // 获取原图
        const imageUrl = currentOriginalImage || resultImage.src;
        
        // 下载原图
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // 尝试使用Web Share API（iOS Safari 和部分Android浏览器支持）
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], `image-${Date.now()}.png`, { type: blob.type });
            
            if (navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Generated Image',
                        text: 'Save this image'
                    });
                    
                    // 显示成功提示
                    showToast(i18n[currentLang]['result.saved']);
                    return;
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('Share failed:', err);
                    }
                }
            }
        }
        
        // 备用方案：创建下载链接
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `image-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
        
        // 显示提示
        showToast(i18n[currentLang]['result.saveFailed']);
        
    } catch (error) {
        console.error('Save failed:', error);
        showToast(i18n[currentLang]['result.saveFailed']);
    }
}

// 显示提示消息
function showToast(message) {
    // 移除已存在的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 3秒后隐藏
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function afterGenerateSuccess(result, meta) {
    resultImage.src = result.thumbnail || result.image;
    currentOriginalImage = result.image;
    if (compareBox) compareBox.classList.add('hidden');
    lastResultSummary = { mode: 'generate', ...meta };
    setResultMeta([
        `${currentLang === 'zh' ? '模式' : 'Mode'}: generate${meta.grid ? ' (grid)' : ''}`,
        `${currentLang === 'zh' ? '尺寸' : 'Size'}: ${meta.width}×${meta.height}`,
        `steps: ${meta.steps}, cfg: ${meta.cfg}`,
        `${currentLang === 'zh' ? '提示' : 'Prompt'}: ${meta.prompt.slice(0, 320)}${
            meta.prompt.length > 320 ? '…' : ''
        }`
    ]);
    hideLoadingProgress();
    updateDownloadButtonText();
    resultSection.classList.remove('hidden');
    showForgePage('editor');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await registerHistoryEntry({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        mode: 'generate',
        taskType: meta.grid ? 'grid' : 'generate',
        prompt: meta.prompt,
        params: {
            width: meta.width,
            height: meta.height,
            steps: meta.steps,
            cfg: meta.cfg
        },
        outRel: result.image,
        thumbRel: result.thumbnail || result.image,
        inThumbDataUrl: null,
        status: 'done',
        err: null
    });
}

// Generate image (T2I)
generateBtn.addEventListener('click', async () => {
    const prompt = generatePrompt.value.trim();
    if (!prompt) {
        showAlert(i18n[currentLang]['error.noPrompt']);
        return;
    }
    
    const width = parseInt(widthInput.value);
    const height = parseInt(heightInput.value);
    const steps = parseInt(stepsInput.value);
    const cfg = parseFloat(cfgInput.value);
    const gridMode = gridModeCheckbox.checked;
    
    // Validate parameters
    if (width < 256 || width > 2048 || height < 256 || height > 2048) {
        showAlert(i18n[currentLang]['error.invalidSize']);
        return;
    }
    
    if (steps < 1 || steps > 50) {
        showAlert(i18n[currentLang]['error.invalidSteps']);
        return;
    }
    
    // Show loading state
    generateBtn.disabled = true;
    generateBtn.querySelector('.btn-text').classList.add('hidden');
    generateBtn.querySelector('.btn-loading').classList.remove('hidden');
    
    showLoadingProgress();

    activeAbortController = new AbortController();
    const tm = setTimeout(() => {
        try {
            activeAbortController.abort();
        } catch (_) {}
    }, TASK_CLIENT_TIMEOUT_MS);

    try {
        const metaBase = { prompt, width, height, steps, cfg, grid: gridMode };

        if (gridMode) {
            const response = await fetch(apiUrl('/api/generate-grid'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    width,
                    height,
                    steps,
                    cfg,
                    accessCode: currentAccessCode
                }),
                signal: activeAbortController.signal
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                if (response.status === 402) {
                    throw new Error(i18n[currentLang]['credits.insufficient']);
                }
                throw new Error(error.error || 'Failed to generate image');
            }

            const data = await response.json();
            if (data.creditsRemaining !== undefined) {
                creditsCount.textContent = data.creditsRemaining;
                currentUser.credits = data.creditsRemaining;
            }
            await afterGenerateSuccess(data, metaBase);
        } else {
            const response = await fetch(apiUrl('/api/generate-stream'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    width,
                    height,
                    steps,
                    cfg,
                    accessCode: currentAccessCode
                }),
                signal: activeAbortController.signal
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                if (response.status === 402) {
                    throw new Error(i18n[currentLang]['credits.insufficient']);
                }
                throw new Error(error.error || 'Failed to generate image');
            }

            let finalResult = null;
            await consumeSseStream(
                response,
                async (data) => {
                    if (data.progress !== undefined) updateRealProgress(data.progress);
                    if (data.status === 'completed' && data.result) {
                        finalResult = data.result;
                        if (data.result.creditsRemaining !== undefined) {
                            creditsCount.textContent = data.result.creditsRemaining;
                            currentUser.credits = data.result.creditsRemaining;
                        }
                    }
                    if (data.status === 'error') {
                        throw new Error(data.error || 'Failed to generate image');
                    }
                },
                activeAbortController.signal
            );

            if (!finalResult) throw new Error('No result');
            await afterGenerateSuccess(finalResult, metaBase);
        }
    } catch (error) {
        hideLoadingProgress();
        resultSection.classList.add('hidden');
        if (forgeUserCancelled) {
            showAlert(i18n[currentLang]['task.cancelled']);
        } else if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
            showAlert(i18n[currentLang]['task.timeout']);
        } else {
            showAlert(`Error: ${error.message}`);
        }
    } finally {
        forgeUserCancelled = false;
        clearTimeout(tm);
        activeAbortController = null;
        generateBtn.disabled = false;
        generateBtn.querySelector('.btn-text').classList.remove('hidden');
        generateBtn.querySelector('.btn-loading').classList.add('hidden');
    }
});

if (forgeNav) {
    forgeNav.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-page]');
        if (!b) return;
        showForgePage(b.dataset.page);
    });
}

document.querySelectorAll('.home-card').forEach((card) => {
    card.addEventListener('click', () => {
        const open = card.dataset.open;
        if (open === 'history') {
            showForgePage('history');
            return;
        }
        if (open === 'settings') {
            showForgePage('settings');
            return;
        }
        if (open === 'editor') {
            applyHomeTaskIntent(card.dataset.task || 'style');
            tabBtns.forEach((b) => b.classList.remove('active'));
            const editTab = document.querySelector('.tab-btn[data-mode="edit"]');
            if (editTab) editTab.classList.add('active');
            editMode.classList.add('active');
            generateMode.classList.remove('active');
            currentMode = 'edit';
            showForgePage('editor');
        }
    });
});

document.querySelectorAll('.sample-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
        const f = await createSampleFile(btn.dataset.sample || 'neutral');
        if (f) handleFile(f);
    });
});

if (cancelTaskBtn) {
    cancelTaskBtn.addEventListener('click', () => {
        forgeUserCancelled = true;
        if (activeAbortController) activeAbortController.abort();
    });
}

if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => {
        showForgePage('editor');
        if (currentMode === 'edit') {
            promptInput.focus();
            resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            generatePrompt.focus();
        }
    });
}

if (historyModalClose) {
    historyModalClose.addEventListener('click', closeHistoryModal);
}
if (historyModal) {
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) closeHistoryModal();
    });
}
if (historyModalOpenEditor) {
    historyModalOpenEditor.addEventListener('click', () => {
        if (!historyModalItem) return;
        showForgePage('editor');
        if (historyModalItem.mode === 'generate') {
            tabBtns.forEach((b) => b.classList.remove('active'));
            const gTab = document.querySelector('.tab-btn[data-mode="generate"]');
            if (gTab) gTab.classList.add('active');
            editMode.classList.remove('active');
            generateMode.classList.add('active');
            currentMode = 'generate';
            generatePrompt.value = historyModalItem.prompt || '';
            if (historyModalItem.params) {
                if (historyModalItem.params.width)
                    widthInput.value = historyModalItem.params.width;
                if (historyModalItem.params.height)
                    heightInput.value = historyModalItem.params.height;
                if (historyModalItem.params.steps)
                    stepsInput.value = historyModalItem.params.steps;
                if (historyModalItem.params.cfg != null)
                    cfgInput.value = historyModalItem.params.cfg;
            }
        } else {
            tabBtns.forEach((b) => b.classList.remove('active'));
            const eTab = document.querySelector('.tab-btn[data-mode="edit"]');
            if (eTab) eTab.classList.add('active');
            editMode.classList.add('active');
            generateMode.classList.remove('active');
            currentMode = 'edit';
            promptInput.value = historyModalItem.prompt || '';
            if (negativePrompt && historyModalItem.params)
                negativePrompt.value = historyModalItem.params.negative || '';
            const wtRev = {
                img2img_style: 'style',
                image_upscale: 'upscale',
                background_repaint: 'background'
            };
            const wt = historyModalItem.params && historyModalItem.params.workflowTemplate;
            editIntentTask = wt
                ? wtRev[wt] || historyModalItem.taskType || 'style'
                : historyModalItem.taskType || 'style';
            updateEditButton();
        }
        closeHistoryModal();
    });
}

if (btnRefreshHealth) {
    btnRefreshHealth.addEventListener('click', () => runHealthToPanel());
}

if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
        const ok = confirm(
            currentLang === 'zh'
                ? '确定清空本地历史？'
                : 'Clear all local history?'
        );
        if (!ok) return;
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        renderHistoryList();
    });
}

// Initialize
if (checkAuth()) {
    checkHealth();
    setInterval(checkHealth, 30000);
    loadPlans();
    loadForgePresets();
    showForgePage('home');
}
