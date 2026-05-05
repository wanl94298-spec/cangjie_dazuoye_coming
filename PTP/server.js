const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const app = express();
const PORT = 38024;

// 多个 ComfyUI 实例（单机单卡时只保留一个；多卡多进程时再追加端口）
const COMFYUI_INSTANCES = [
    'http://127.0.0.1:8188'
];

// 单实例模式（向后兼容）
const COMFYUI_URL = COMFYUI_INSTANCES[0];

// 与本地 ComfyUI models 扫描结果一致；旧机器若路径不同可设环境变量覆盖
const COMFYUI_UNET_NAME =
    process.env.COMFYUI_UNET_NAME || 'flux-2-klein-9b-fp8.safetensors';
const COMFYUI_CLIP_NAME =
    process.env.COMFYUI_CLIP_NAME ||
    'split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors';
const COMFYUI_VAE_NAME =
    process.env.COMFYUI_VAE_NAME || 'full_encoder_small_decoder.safetensors';

function comfyuiErrorMessage(error, fallback = 'ComfyUI 请求失败') {
    const d = error.response?.data;
    if (d !== undefined && d !== null) {
        if (typeof d === 'string' && d.trim()) return d.trim().slice(0, 2000);
        if (typeof d === 'object') {
            const msg =
                d.error?.message ||
                d.message ||
                (typeof d.error === 'string' ? d.error : null);
            if (msg) return String(msg).slice(0, 2000);
            try {
                return JSON.stringify(d).slice(0, 2000);
            } catch (_) {
                /* ignore */
            }
        }
    }
    return error.message || fallback;
}

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, 'users.json');
const PRESETS_FILE = path.join(__dirname, 'workflows', 'presets.json');

let APP_PACKAGE = { name: 'p2p-image-editor', version: '1.0.0' };
try {
    APP_PACKAGE = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
    );
} catch (_) {
    /* keep defaults */
}

/** 与 GET /api/version 及 public/version-info.json 共用，便于设置页在 API 未部署时回退读取静态文件 */
function getVersionPayload() {
    return {
        name: APP_PACKAGE.name,
        version: APP_PACKAGE.version,
        role: 'imageforge-web-bff',
        comfyuiUrl: COMFYUI_URL,
        hint:
            'Web 仅请求本服务；ComfyUI 由服务端转发。鸿蒙端可对齐同一 REST/SSE 契约。'
    };
}

const VERSION_INFO_PUBLIC_PATH = path.join(__dirname, 'public', 'version-info.json');
function writePublicVersionInfoFile() {
    try {
        const payload = {
            ...getVersionPayload(),
            _staticFallback: true,
            _writtenAt: new Date().toISOString()
        };
        fs.writeFileSync(
            VERSION_INFO_PUBLIC_PATH,
            JSON.stringify(payload, null, 2),
            'utf8'
        );
    } catch (err) {
        console.warn('[version-info.json]', err.message);
    }
}
writePublicVersionInfoFile();

// 订阅方案配置
const SUBSCRIPTION_PLANS = {
    free: {
        name: { en: 'Free', zh: '免费版' },
        credits: 10,
        creditCost: { edit: 2, generate: 1 },
        price: 0,
        features: {
            en: ['10 credits/month', 'Basic quality', 'Standard support'],
            zh: ['10 积分/月', '基础画质', '标准支持']
        }
    },
    basic: {
        name: { en: 'Basic', zh: '基础版' },
        credits: 100,
        creditCost: { edit: 2, generate: 1 },
        price: 9.99,
        features: {
            en: ['100 credits/month', 'High quality', 'Priority support', 'No watermark'],
            zh: ['100 积分/月', '高清画质', '优先支持', '无水印']
        }
    },
    pro: {
        name: { en: 'Professional', zh: '专业版' },
        credits: 500,
        creditCost: { edit: 1, generate: 1 },
        price: 29.99,
        features: {
            en: ['500 credits/month', 'Ultra quality', '24/7 support', 'API access', 'Commercial license'],
            zh: ['500 积分/月', '超高清画质', '24/7 支持', 'API 访问', '商业授权']
        }
    },
    enterprise: {
        name: { en: 'Enterprise', zh: '企业版' },
        credits: 2000,
        creditCost: { edit: 1, generate: 1 },
        price: 99.99,
        features: {
            en: ['2000 credits/month', 'Maximum quality', 'Dedicated support', 'Custom API', 'White label', 'SLA guarantee'],
            zh: ['2000 积分/月', '最高画质', '专属支持', '定制 API', '白标服务', 'SLA 保障']
        }
    },
    beta: {
        name: { en: 'Beta User', zh: '内测用户' },
        credits: 999999,
        creditCost: { edit: 0, generate: 0 },
        price: 0,
        features: {
            en: ['Unlimited credits', 'All features', 'Beta access'],
            zh: ['无限积分', '全部功能', '内测权限']
        }
    }
};

// 读取用户数据
function loadUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load users:', error);
        return {};
    }
}

// 保存用户数据
function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to save users:', error);
        return false;
    }
}

// 验证访问码并返回用户信息
function authenticateUser(accessCode) {
    const users = loadUsers();
    const user = users[accessCode];
    
    if (!user) {
        return null;
    }
    
    // 添加订阅方案信息
    const plan = SUBSCRIPTION_PLANS[user.plan] || SUBSCRIPTION_PLANS.free;
    
    return {
        userId: user.userId,
        username: user.username,
        email: user.email,
        plan: user.plan,
        planName: plan.name.en, // 默认返回英文名称，前端会根据语言切换
        credits: user.credits,
        usedCredits: user.usedCredits,
        creditCost: plan.creditCost,
        features: plan.features.en,
        createdAt: user.createdAt,
        expiresAt: user.expiresAt
    };
}

// 扣除积分
function deductCredits(accessCode, operation) {
    const users = loadUsers();
    const user = users[accessCode];
    
    if (!user) {
        return { success: false, error: 'User not found' };
    }
    
    const plan = SUBSCRIPTION_PLANS[user.plan] || SUBSCRIPTION_PLANS.free;
    const cost = plan.creditCost[operation] || 1;
    
    // Beta用户不扣积分
    if (user.plan === 'beta') {
        return { success: true, credits: user.credits, cost: 0 };
    }
    
    if (user.credits < cost) {
        return { success: false, error: 'Insufficient credits', credits: user.credits, required: cost };
    }
    
    user.credits -= cost;
    user.usedCredits += cost;
    
    if (saveUsers(users)) {
        return { success: true, credits: user.credits, cost: cost };
    } else {
        return { success: false, error: 'Failed to update credits' };
    }
}

// 创建必要的目录
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');
[UPLOAD_DIR, OUTPUT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 配置文件上传
const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|webp)$/i;
        if (allowed.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

app.use(express.json());

// 靠前注册，避免线上进程因旧代码或未执行到文件后部而缺少该路由（Cannot GET /api/version）
app.get('/api/version', (req, res) => {
    res.json(getVersionPayload());
});

// API: 用户认证
app.post('/api/auth', (req, res) => {
    const { accessCode } = req.body;
    
    if (!accessCode) {
        return res.status(400).json({ error: 'Access code is required' });
    }
    
    const user = authenticateUser(accessCode);
    
    if (!user) {
        return res.status(401).json({ error: 'Invalid access code' });
    }
    
    res.json({
        success: true,
        user: user
    });
});

// API: 获取订阅方案
app.get('/api/plans', (req, res) => {
    const lang = req.query.lang || 'en';
    
    const plans = Object.entries(SUBSCRIPTION_PLANS)
        .filter(([key]) => key !== 'beta') // 不显示beta方案
        .map(([key, plan]) => ({
            id: key,
            name: plan.name[lang] || plan.name.en,
            credits: plan.credits,
            price: plan.price,
            features: plan.features[lang] || plan.features.en,
            creditCost: plan.creditCost
        }));
    
    res.json({ plans });
});

// 上传图片到ComfyUI
async function uploadImageToComfyUI(filePath, filename) {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(filePath), filename);
    formData.append('overwrite', 'true');
    
    try {
        await axios.post(`${COMFYUI_URL}/upload/image`, formData, {
            headers: formData.getHeaders()
        });
    } catch (error) {
        throw new Error(
            `上传到 ComfyUI 失败: ${comfyuiErrorMessage(error)}`
        );
    }
}

// 生成P2P工作流（图片编辑）
function generateP2PWorkflow(imageName, prompt, seed) {
    return {
        "9": {
            "inputs": {
                "filename_prefix": "p2p-edit",
                "images": ["75:65", 0]
            },
            "class_type": "SaveImage"
        },
        "76": {
            "inputs": {
                "image": imageName
            },
            "class_type": "LoadImage"
        },
        "75:61": {
            "inputs": {
                "sampler_name": "euler"
            },
            "class_type": "KSamplerSelect"
        },
        "75:64": {
            "inputs": {
                "noise": ["75:73", 0],
                "guider": ["75:63", 0],
                "sampler": ["75:61", 0],
                "sigmas": ["75:62", 0],
                "latent_image": ["75:66", 0]
            },
            "class_type": "SamplerCustomAdvanced"
        },
        "75:65": {
            "inputs": {
                "samples": ["75:64", 0],
                "vae": ["75:72", 0]
            },
            "class_type": "VAEDecode"
        },
        "75:73": {
            "inputs": {
                "noise_seed": seed
            },
            "class_type": "RandomNoise"
        },
        "75:70": {
            "inputs": {
                "unet_name": COMFYUI_UNET_NAME,
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader"
        },
        "75:71": {
            "inputs": {
                "clip_name": COMFYUI_CLIP_NAME,
                "type": "flux2",
                "device": "default"
            },
            "class_type": "CLIPLoader"
        },
        "75:72": {
            "inputs": {
                "vae_name": COMFYUI_VAE_NAME
            },
            "class_type": "VAELoader"
        },
        "75:66": {
            "inputs": {
                "width": ["75:81", 0],
                "height": ["75:81", 1],
                "batch_size": 1
            },
            "class_type": "EmptyFlux2LatentImage"
        },
        "75:80": {
            "inputs": {
                "upscale_method": "nearest-exact",
                "megapixels": 1,
                "resolution_steps": 1,
                "image": ["76", 0]
            },
            "class_type": "ImageScaleToTotalPixels"
        },
        "75:63": {
            "inputs": {
                "cfg": 1,
                "model": ["75:70", 0],
                "positive": ["75:79:77", 0],
                "negative": ["75:79:76", 0]
            },
            "class_type": "CFGGuider"
        },
        "75:62": {
            "inputs": {
                "steps": 4,
                "width": ["75:81", 0],
                "height": ["75:81", 1]
            },
            "class_type": "Flux2Scheduler"
        },
        "75:74": {
            "inputs": {
                "text": prompt,
                "clip": ["75:71", 0]
            },
            "class_type": "CLIPTextEncode"
        },
        "75:82": {
            "inputs": {
                "conditioning": ["75:74", 0]
            },
            "class_type": "ConditioningZeroOut"
        },
        "75:81": {
            "inputs": {
                "image": ["75:80", 0]
            },
            "class_type": "GetImageSize"
        },
        "75:79:76": {
            "inputs": {
                "conditioning": ["75:82", 0],
                "latent": ["75:79:78", 0]
            },
            "class_type": "ReferenceLatent"
        },
        "75:79:78": {
            "inputs": {
                "pixels": ["75:80", 0],
                "vae": ["75:72", 0]
            },
            "class_type": "VAEEncode"
        },
        "75:79:77": {
            "inputs": {
                "conditioning": ["75:74", 0],
                "latent": ["75:79:78", 0]
            },
            "class_type": "ReferenceLatent"
        }
    };
}

/** 前端 / 客户端传入的模板别名 → 内部 ID */
const EDIT_TEMPLATE_ALIASES = {
    style: 'img2img_style',
    img2img_style: 'img2img_style',
    upscale: 'image_upscale',
    image_upscale: 'image_upscale',
    background: 'background_repaint',
    bg: 'background_repaint',
    background_repaint: 'background_repaint'
};

/**
 * 三类编辑在 ComfyUI 图上的真实差异（非仅提示词）：
 * - 风格化：低步数、1MP 量级、nearest 缩放
 * - 高清增强：lanczos + 更高 megapixels + 更高 steps（真上采样后再走 Flux2）
 * - 背景重绘：中等步数 + 略提高 CFG，强化文本对画面的牵引
 */
const EDIT_VARIANT_INPUT_PATCHES = {
    img2img_style: {
        '75:80': { upscale_method: 'nearest-exact', megapixels: 1 },
        '75:62': { steps: 4 },
        '75:63': { cfg: 1 },
        '9': { filename_prefix: 'if-style' }
    },
    image_upscale: {
        '75:80': { upscale_method: 'lanczos', megapixels: 2.25 },
        '75:62': { steps: 12 },
        '75:63': { cfg: 1 },
        '9': { filename_prefix: 'if-upscale' }
    },
    background_repaint: {
        '75:80': { upscale_method: 'lanczos', megapixels: 1 },
        '75:62': { steps: 8 },
        '75:63': { cfg: 1.22 },
        '9': { filename_prefix: 'if-bg' }
    }
};

let editVariantFileCache = null;

function loadEditVariantFilePatches() {
    if (editVariantFileCache !== null) return editVariantFileCache;
    try {
        const p = path.join(__dirname, 'workflows', 'edit_variants.json');
        editVariantFileCache = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) {
        editVariantFileCache = {};
    }
    return editVariantFileCache;
}

function normalizeEditTemplate(raw) {
    const k = String(raw || 'img2img_style')
        .trim()
        .toLowerCase();
    return EDIT_TEMPLATE_ALIASES[k] || 'img2img_style';
}

/** 在 generateP2PWorkflow 基础上按模板合并真实节点参数（可被 edit_variants.json 覆盖） */
function buildEditWorkflow(templateRaw, imageName, prompt, seed) {
    const tid = normalizeEditTemplate(templateRaw);
    const workflow = generateP2PWorkflow(imageName, prompt, seed);
    const base = EDIT_VARIANT_INPUT_PATCHES[tid] || EDIT_VARIANT_INPUT_PATCHES.img2img_style;
    const extra = loadEditVariantFilePatches()[tid] || {};
    const nodeIds = new Set([
        ...Object.keys(base),
        ...Object.keys(extra)
    ]);
    for (const nodeId of nodeIds) {
        if (!workflow[nodeId] || !workflow[nodeId].inputs) continue;
        const patch = { ...(base[nodeId] || {}), ...(extra[nodeId] || {}) };
        Object.assign(workflow[nodeId].inputs, patch);
    }
    return workflow;
}

// 生成T2I工作流（文字生成图片）
function generateT2IWorkflow(prompt, width, height, seed, steps, cfg, filenamePrefix = 't2i-gen') {
    return {
        "76": {
            "inputs": {
                "value": prompt
            },
            "class_type": "PrimitiveStringMultiline"
        },
        "78": {
            "inputs": {
                "filename_prefix": filenamePrefix,
                "images": ["77:65", 0]
            },
            "class_type": "SaveImage"
        },
        "77:61": {
            "inputs": {
                "sampler_name": "euler"
            },
            "class_type": "KSamplerSelect"
        },
        "77:64": {
            "inputs": {
                "noise": ["77:73", 0],
                "guider": ["77:63", 0],
                "sampler": ["77:61", 0],
                "sigmas": ["77:62", 0],
                "latent_image": ["77:66", 0]
            },
            "class_type": "SamplerCustomAdvanced"
        },
        "77:65": {
            "inputs": {
                "samples": ["77:64", 0],
                "vae": ["77:72", 0]
            },
            "class_type": "VAEDecode"
        },
        "77:66": {
            "inputs": {
                "width": ["77:68", 0],
                "height": ["77:69", 0],
                "batch_size": 1
            },
            "class_type": "EmptyFlux2LatentImage"
        },
        "77:68": {
            "inputs": {
                "value": width
            },
            "class_type": "PrimitiveInt"
        },
        "77:69": {
            "inputs": {
                "value": height
            },
            "class_type": "PrimitiveInt"
        },
        "77:73": {
            "inputs": {
                "noise_seed": seed
            },
            "class_type": "RandomNoise"
        },
        "77:70": {
            "inputs": {
                "unet_name": COMFYUI_UNET_NAME,
                "weight_dtype": "default"
            },
            "class_type": "UNETLoader"
        },
        "77:71": {
            "inputs": {
                "clip_name": COMFYUI_CLIP_NAME,
                "type": "flux2",
                "device": "default"
            },
            "class_type": "CLIPLoader"
        },
        "77:72": {
            "inputs": {
                "vae_name": COMFYUI_VAE_NAME
            },
            "class_type": "VAELoader"
        },
        "77:63": {
            "inputs": {
                "cfg": cfg,
                "model": ["77:70", 0],
                "positive": ["77:74", 0],
                "negative": ["77:76", 0]
            },
            "class_type": "CFGGuider"
        },
        "77:76": {
            "inputs": {
                "conditioning": ["77:74", 0]
            },
            "class_type": "ConditioningZeroOut"
        },
        "77:74": {
            "inputs": {
                "text": ["76", 0],
                "clip": ["77:71", 0]
            },
            "class_type": "CLIPTextEncode"
        },
        "77:62": {
            "inputs": {
                "steps": steps,
                "width": ["77:68", 0],
                "height": ["77:69", 0]
            },
            "class_type": "Flux2Scheduler"
        }
    };
}

// 提交工作流到ComfyUI
async function queuePrompt(workflow) {
    try {
        const response = await axios.post(`${COMFYUI_URL}/prompt`, {
            prompt: workflow,
            client_id: uuidv4()
        });
        return response.data.prompt_id;
    } catch (error) {
        throw new Error(
            `ComfyUI /prompt: ${comfyuiErrorMessage(error)}`
        );
    }
}

// 生成缩略图
async function generateThumbnail(imagePath, thumbnailPath, maxWidth = 800) {
    try {
        await sharp(imagePath)
            .resize(maxWidth, null, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toFile(thumbnailPath);
        return true;
    } catch (error) {
        console.error('Thumbnail generation failed:', error);
        return false;
    }
}

// 合成四宫格图片
async function createGridImage(imagePaths, outputPath) {
    try {
        // 读取所有图片
        const images = await Promise.all(
            imagePaths.map(p => sharp(p).metadata().then(meta => ({ path: p, meta })))
        );
        
        // 假设所有图片尺寸相同，取第一张的尺寸
        const width = images[0].meta.width;
        const height = images[0].meta.height;
        
        // 创建2x2网格
        const gridWidth = width * 2;
        const gridHeight = height * 2;
        
        // 读取并调整所有图片
        const buffers = await Promise.all(
            imagePaths.map(p => sharp(p).toBuffer())
        );
        
        // 创建四宫格
        await sharp({
            create: {
                width: gridWidth,
                height: gridHeight,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        })
        .composite([
            { input: buffers[0], left: 0, top: 0 },           // 左上
            { input: buffers[1], left: width, top: 0 },       // 右上
            { input: buffers[2], left: 0, top: height },      // 左下
            { input: buffers[3], left: width, top: height }   // 右下
        ])
        .png()
        .toFile(outputPath);
        
        return true;
    } catch (error) {
        console.error('Grid creation failed:', error);
        return false;
    }
}

// 并行生成多张图片
async function generateImagesParallel(prompt, width, height, seed, steps, cfg, count = 4) {
    const promises = [];
    const batchId = Date.now().toString(36); // 唯一批次ID
    
    for (let i = 0; i < count; i++) {
        const instanceUrl = COMFYUI_INSTANCES[i % COMFYUI_INSTANCES.length];
        // 每张图片使用完全独立的随机seed，避免相似结果
        const imageSeed = Math.floor(Math.random() * 1000000000000000);
        // 每个实例使用唯一的filename_prefix，避免共享输出目录时文件名冲突
        const filenamePrefix = `grid-${batchId}-gpu${i}`;
        
        const workflow = generateT2IWorkflow(prompt, width, height, imageSeed, steps, cfg, filenamePrefix);
        
        promises.push(
            queuePromptToInstance(instanceUrl, workflow)
                .then(promptId => waitForCompletionFromInstance(instanceUrl, promptId))
                .then(result => downloadImageFromInstance(instanceUrl, result))
        );
    }
    
    return Promise.all(promises);
}

// 提交工作流到指定实例
async function queuePromptToInstance(instanceUrl, workflow) {
    try {
        const response = await axios.post(`${instanceUrl}/prompt`, {
            prompt: workflow,
            client_id: uuidv4()
        });
        return response.data.prompt_id;
    } catch (error) {
        throw new Error(
            `ComfyUI /prompt (${instanceUrl}): ${comfyuiErrorMessage(error)}`
        );
    }
}

// 从指定实例等待完成
async function waitForCompletionFromInstance(instanceUrl, promptId, timeout = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const historyRes = await axios.get(`${instanceUrl}/history/${promptId}`);
            const history = historyRes.data[promptId];
            
            if (history && history.status && history.status.completed) {
                const outputs = history.outputs;
                for (const nodeId in outputs) {
                    if (outputs[nodeId].images) {
                        return outputs[nodeId].images[0];
                    }
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error('Timeout waiting for image generation');
}

// 从指定实例下载图片
async function downloadImageFromInstance(instanceUrl, result) {
    const imageUrl = `${instanceUrl}/view?filename=${result.filename}&subfolder=${result.subfolder || ''}&type=${result.type}`;
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    
    const outputFilename = `${uuidv4()}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    fs.writeFileSync(outputPath, imageResponse.data);
    
    return outputPath;
}

// 轮询检查任务状态
async function waitForCompletion(promptId, timeout = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const historyRes = await axios.get(`${COMFYUI_URL}/history/${promptId}`);
            const history = historyRes.data[promptId];
            
            if (history && history.status && history.status.completed) {
                // 获取输出图片
                const outputs = history.outputs;
                for (const nodeId in outputs) {
                    if (outputs[nodeId].images) {
                        return outputs[nodeId].images[0];
                    }
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error('Timeout waiting for image generation');
}

// 流式轮询检查任务状态（支持进度推送）
async function waitForCompletionStream(promptId, onProgress, timeout = 300000) {
    const startTime = Date.now();
    let lastProgress = 0;
    
    while (Date.now() - startTime < timeout) {
        try {
            // 获取队列状态
            const queueRes = await axios.get(`${COMFYUI_URL}/queue`);
            const queue = queueRes.data;
            
            // 检查是否在运行队列中
            const runningItem = queue.queue_running.find(item => item[1] === promptId);
            if (runningItem) {
                // 任务正在执行
                const progress = Math.min(50 + lastProgress * 0.5, 85);
                onProgress({ status: 'processing', progress: Math.floor(progress) });
                lastProgress = progress;
            }
            
            // 检查历史记录
            const historyRes = await axios.get(`${COMFYUI_URL}/history/${promptId}`);
            const history = historyRes.data[promptId];
            
            if (history && history.status) {
                if (history.status.completed) {
                    // 任务完成
                    onProgress({ status: 'completed', progress: 100 });
                    
                    const outputs = history.outputs;
                    for (const nodeId in outputs) {
                        if (outputs[nodeId].images) {
                            return outputs[nodeId].images[0];
                        }
                    }
                } else if (history.status.status_str) {
                    // 推送状态信息
                    const progress = Math.min(30 + lastProgress * 0.3, 70);
                    onProgress({ 
                        status: 'processing', 
                        progress: Math.floor(progress),
                        message: history.status.status_str 
                    });
                    lastProgress = progress;
                }
            } else {
                // 任务在队列中等待
                const pendingItem = queue.queue_pending.find(item => item[1] === promptId);
                if (pendingItem) {
                    const queuePosition = queue.queue_pending.indexOf(pendingItem) + 1;
                    onProgress({ 
                        status: 'queued', 
                        progress: 10,
                        message: `Queue position: ${queuePosition}` 
                    });
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error('Timeout waiting for image generation');
}

// API: 文字生成图片（四宫格并行模式）
app.post('/api/generate-grid', async (req, res) => {
    try {
        const { prompt, width = 1024, height = 1024, steps = 4, cfg = 1, accessCode } = req.body;
        
        if (!accessCode) {
            return res.status(401).json({ error: 'Access code is required' });
        }
        
        // 验证用户
        const user = authenticateUser(accessCode);
        if (!user) {
            return res.status(401).json({ error: 'Invalid access code' });
        }
        
        // 检查并扣除积分（生成4张图片，消耗4倍积分）
        const creditResult = deductCredits(accessCode, 'generate');
        if (!creditResult.success) {
            return res.status(402).json({ 
                error: creditResult.error,
                credits: creditResult.credits,
                required: creditResult.required
            });
        }
        
        // 再扣除3次（总共4次）
        for (let i = 0; i < 3; i++) {
            const extraCredit = deductCredits(accessCode, 'generate');
            if (!extraCredit.success) {
                return res.status(402).json({ 
                    error: 'Insufficient credits for 4 images',
                    credits: extraCredit.credits,
                    required: extraCredit.required
                });
            }
        }
        
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        // 验证参数
        if (width < 256 || width > 2048 || height < 256 || height > 2048) {
            return res.status(400).json({ error: 'Width and height must be between 256 and 2048' });
        }
        
        if (steps < 1 || steps > 50) {
            return res.status(400).json({ error: 'Steps must be between 1 and 50' });
        }
        
        const seed = Math.floor(Math.random() * 1000000000000000);
        
        console.log(`🎨 开始并行生成4张图片...`);
        console.log(`   提示词: ${prompt.substring(0, 50)}...`);
        console.log(`   使用GPU: 4个实例并行`);
        
        // 并行生成4张图片
        const imagePaths = await generateImagesParallel(prompt, width, height, seed, steps, cfg, 4);
        
        console.log(`✅ 4张图片生成完成，开始合成四宫格...`);
        
        // 合成四宫格
        const gridFilename = `grid_${uuidv4()}.png`;
        const gridPath = path.join(OUTPUT_DIR, gridFilename);
        await createGridImage(imagePaths, gridPath);
        
        console.log(`✅ 四宫格合成完成: ${gridFilename}`);
        
        // 生成缩略图
        const thumbnailFilename = `thumb_${gridFilename.replace('.png', '.jpg')}`;
        const thumbnailPath = path.join(OUTPUT_DIR, thumbnailFilename);
        await generateThumbnail(gridPath, thumbnailPath, 1200);
        
        // 清理单独的图片文件（可选，如果想保留可以注释掉）
        // imagePaths.forEach(p => fs.unlinkSync(p));
        
        res.json({
            success: true,
            image: `/outputs/${gridFilename}`,
            thumbnail: `/outputs/${thumbnailFilename}`,
            individual_images: imagePaths.map(p => `/outputs/${path.basename(p)}`),
            prompt: prompt,
            width: width * 2,  // 四宫格宽度
            height: height * 2, // 四宫格高度
            seed: seed,
            creditsUsed: creditResult.cost * 4,
            creditsRemaining: creditResult.credits
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate grid image',
            details: error.message 
        });
    }
});

// API: 文字生成图片（原单张模式，保持向后兼容）
app.post('/api/generate', async (req, res) => {
    try {
        const { prompt, width = 1024, height = 1024, steps = 4, cfg = 1, accessCode } = req.body;
        
        if (!accessCode) {
            return res.status(401).json({ error: 'Access code is required' });
        }
        
        // 验证用户
        const user = authenticateUser(accessCode);
        if (!user) {
            return res.status(401).json({ error: 'Invalid access code' });
        }
        
        // 检查并扣除积分
        const creditResult = deductCredits(accessCode, 'generate');
        if (!creditResult.success) {
            return res.status(402).json({ 
                error: creditResult.error,
                credits: creditResult.credits,
                required: creditResult.required
            });
        }
        
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        // 验证参数
        if (width < 256 || width > 2048 || height < 256 || height > 2048) {
            return res.status(400).json({ error: 'Width and height must be between 256 and 2048' });
        }
        
        if (steps < 1 || steps > 50) {
            return res.status(400).json({ error: 'Steps must be between 1 and 50' });
        }
        
        const seed = Math.floor(Math.random() * 1000000000000000);
        
        // 生成并提交工作流
        const workflow = generateT2IWorkflow(prompt, width, height, seed, steps, cfg);
        const promptId = await queuePrompt(workflow);
        
        // 等待完成
        const result = await waitForCompletion(promptId);
        
        // 下载结果图片
        const imageUrl = `${COMFYUI_URL}/view?filename=${result.filename}&subfolder=${result.subfolder || ''}&type=${result.type}`;
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        
        const outputFilename = `${uuidv4()}.png`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);
        fs.writeFileSync(outputPath, imageResponse.data);
        
        // 生成缩略图
        const thumbnailFilename = `thumb_${outputFilename.replace('.png', '.jpg')}`;
        const thumbnailPath = path.join(OUTPUT_DIR, thumbnailFilename);
        await generateThumbnail(outputPath, thumbnailPath, 800);
        
        res.json({
            success: true,
            image: `/outputs/${outputFilename}`,
            thumbnail: `/outputs/${thumbnailFilename}`,
            prompt: prompt,
            width: width,
            height: height,
            seed: seed,
            creditsUsed: creditResult.cost,
            creditsRemaining: creditResult.credits
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate image',
            details: error.message 
        });
    }
});

// API: 文字生成图片（流式SSE版本）
app.post('/api/generate-stream', async (req, res) => {
    try {
        const { prompt, width = 1024, height = 1024, steps = 4, cfg = 1, accessCode } = req.body;
        
        if (!accessCode) {
            return res.status(401).json({ error: 'Access code is required' });
        }
        
        // 验证用户
        const user = authenticateUser(accessCode);
        if (!user) {
            return res.status(401).json({ error: 'Invalid access code' });
        }
        
        // 检查并扣除积分
        const creditResult = deductCredits(accessCode, 'generate');
        if (!creditResult.success) {
            return res.status(402).json({ 
                error: creditResult.error,
                credits: creditResult.credits,
                required: creditResult.required
            });
        }
        
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        // 验证参数
        if (width < 256 || width > 2048 || height < 256 || height > 2048) {
            return res.status(400).json({ error: 'Width and height must be between 256 and 2048' });
        }
        
        if (steps < 1 || steps > 50) {
            return res.status(400).json({ error: 'Steps must be between 1 and 50' });
        }
        
        // 设置SSE响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // 禁用nginx缓冲
        
        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        
        try {
            const seed = Math.floor(Math.random() * 1000000000000000);
            
            // 发送初始化事件
            sendEvent({ status: 'initializing', progress: 5, message: 'Preparing workflow...' });
            
            // 生成并提交工作流
            const workflow = generateT2IWorkflow(prompt, width, height, seed, steps, cfg);
            const promptId = await queuePrompt(workflow);
            
            sendEvent({ status: 'queued', progress: 15, message: 'Workflow submitted...' });
            
            // 等待完成并推送进度
            const result = await waitForCompletionStream(promptId, (progressData) => {
                sendEvent(progressData);
            });
            
            sendEvent({ status: 'downloading', progress: 90, message: 'Downloading result...' });
            
            // 下载结果图片
            const imageUrl = `${COMFYUI_URL}/view?filename=${result.filename}&subfolder=${result.subfolder || ''}&type=${result.type}`;
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            
            const outputFilename = `${uuidv4()}.png`;
            const outputPath = path.join(OUTPUT_DIR, outputFilename);
            fs.writeFileSync(outputPath, imageResponse.data);
            
            sendEvent({ status: 'processing', progress: 95, message: 'Generating thumbnail...' });
            
            // 生成缩略图
            const thumbnailFilename = `thumb_${outputFilename.replace('.png', '.jpg')}`;
            const thumbnailPath = path.join(OUTPUT_DIR, thumbnailFilename);
            await generateThumbnail(outputPath, thumbnailPath, 800);
            
            // 发送完成事件
            sendEvent({
                status: 'completed',
                progress: 100,
                result: {
                    success: true,
                    image: `/outputs/${outputFilename}`,
                    thumbnail: `/outputs/${thumbnailFilename}`,
                    prompt: prompt,
                    width: width,
                    height: height,
                    seed: seed,
                    creditsUsed: creditResult.cost,
                    creditsRemaining: creditResult.credits
                }
            });
            
            res.end();
            
        } catch (error) {
            console.error('Stream error:', error);
            sendEvent({
                status: 'error',
                error: error.message || 'Failed to generate image'
            });
            res.end();
        }
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate image',
            details: error.message 
        });
    }
});

// API: 编辑图片
app.post('/api/edit', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        
        const { prompt, accessCode, workflowTemplate } = req.body;
        
        if (!accessCode) {
            return res.status(401).json({ error: 'Access code is required' });
        }
        
        // 验证用户
        const user = authenticateUser(accessCode);
        if (!user) {
            return res.status(401).json({ error: 'Invalid access code' });
        }
        
        // 检查并扣除积分
        const creditResult = deductCredits(accessCode, 'edit');
        if (!creditResult.success) {
            return res.status(402).json({ 
                error: creditResult.error,
                credits: creditResult.credits,
                required: creditResult.required
            });
        }
        
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        const imageName = req.file.filename;
        const seed = Math.floor(Math.random() * 1000000000000000);
        
        // 上传图片到ComfyUI
        await uploadImageToComfyUI(req.file.path, imageName);
        
        const workflow = buildEditWorkflow(workflowTemplate, imageName, prompt, seed);
        const promptId = await queuePrompt(workflow);
        
        // 等待完成
        const result = await waitForCompletion(promptId);
        
        // 下载结果图片
        const imageUrl = `${COMFYUI_URL}/view?filename=${result.filename}&subfolder=${result.subfolder || ''}&type=${result.type}`;
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        
        const outputFilename = `${uuidv4()}.png`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);
        fs.writeFileSync(outputPath, imageResponse.data);
        
        // 生成缩略图
        const thumbnailFilename = `thumb_${outputFilename.replace('.png', '.jpg')}`;
        const thumbnailPath = path.join(OUTPUT_DIR, thumbnailFilename);
        await generateThumbnail(outputPath, thumbnailPath, 800);
        
        res.json({
            success: true,
            image: `/outputs/${outputFilename}`,
            thumbnail: `/outputs/${thumbnailFilename}`,
            prompt: prompt,
            creditsUsed: creditResult.cost,
            creditsRemaining: creditResult.credits
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to process image',
            details: error.message 
        });
    }
});

// API: 编辑图片（流式SSE版本）
app.post('/api/edit-stream', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }
        
        const { prompt, accessCode, workflowTemplate } = req.body;
        
        if (!accessCode) {
            return res.status(401).json({ error: 'Access code is required' });
        }
        
        // 验证用户
        const user = authenticateUser(accessCode);
        if (!user) {
            return res.status(401).json({ error: 'Invalid access code' });
        }
        
        // 检查并扣除积分
        const creditResult = deductCredits(accessCode, 'edit');
        if (!creditResult.success) {
            return res.status(402).json({ 
                error: creditResult.error,
                credits: creditResult.credits,
                required: creditResult.required
            });
        }
        
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        // 设置SSE响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        
        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        
        try {
            const imageName = req.file.filename;
            const seed = Math.floor(Math.random() * 1000000000000000);
            
            // 发送初始化事件
            sendEvent({ status: 'initializing', progress: 5, message: 'Uploading image...' });
            
            // 上传图片到ComfyUI
            await uploadImageToComfyUI(req.file.path, imageName);
            
            sendEvent({ status: 'preparing', progress: 15, message: 'Preparing workflow...' });
            
            const workflow = buildEditWorkflow(workflowTemplate, imageName, prompt, seed);
            const promptId = await queuePrompt(workflow);
            
            sendEvent({ status: 'queued', progress: 20, message: 'Workflow submitted...' });
            
            // 等待完成并推送进度
            const result = await waitForCompletionStream(promptId, (progressData) => {
                sendEvent(progressData);
            });
            
            sendEvent({ status: 'downloading', progress: 90, message: 'Downloading result...' });
            
            // 下载结果图片
            const imageUrl = `${COMFYUI_URL}/view?filename=${result.filename}&subfolder=${result.subfolder || ''}&type=${result.type}`;
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            
            const outputFilename = `${uuidv4()}.png`;
            const outputPath = path.join(OUTPUT_DIR, outputFilename);
            fs.writeFileSync(outputPath, imageResponse.data);
            
            sendEvent({ status: 'processing', progress: 95, message: 'Generating thumbnail...' });
            
            // 生成缩略图
            const thumbnailFilename = `thumb_${outputFilename.replace('.png', '.jpg')}`;
            const thumbnailPath = path.join(OUTPUT_DIR, thumbnailFilename);
            await generateThumbnail(outputPath, thumbnailPath, 800);
            
            // 发送完成事件
            sendEvent({
                status: 'completed',
                progress: 100,
                result: {
                    success: true,
                    image: `/outputs/${outputFilename}`,
                    thumbnail: `/outputs/${thumbnailFilename}`,
                    prompt: prompt,
                    creditsUsed: creditResult.cost,
                    creditsRemaining: creditResult.credits
                }
            });
            
            res.end();
            
        } catch (error) {
            console.error('Stream error:', error);
            sendEvent({
                status: 'error',
                error: error.message || 'Failed to edit image'
            });
            res.end();
        }
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to process image',
            details: error.message 
        });
    }
});

// 健康检查
app.get('/api/health', async (req, res) => {
    try {
        await axios.get(`${COMFYUI_URL}/system_stats`);
        res.json({ status: 'ok', comfyui: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', comfyui: 'disconnected' });
    }
});

// 工作流模板清单与编辑预置（与 workflows/presets.json 同步，供 Web / 移动端共用）
app.get('/api/presets', (req, res) => {
    try {
        const raw = fs.readFileSync(PRESETS_FILE, 'utf8');
        res.type('application/json').send(raw);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read presets', details: error.message });
    }
});

// 编辑类工作流：各模板在 ComfyUI 节点上的真实参数差异（及可选 edit_variants.json 覆盖）
app.get('/api/edit-variants', (req, res) => {
    res.json({
        aliases: EDIT_TEMPLATE_ALIASES,
        builtinPatches: EDIT_VARIANT_INPUT_PATCHES,
        fileOverrides: loadEditVariantFilePatches()
    });
});

// 静态与产物目录放在 API 之后，避免意外覆盖 /api 等路由
app.use(express.static('public'));
app.use('/workflows', express.static(path.join(__dirname, 'workflows')));
app.use('/outputs', express.static(OUTPUT_DIR));

function lanIPv4Addresses() {
    const nets = os.networkInterfaces();
    const out = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            const v4 =
                net.family === 'IPv4' || net.family === 4;
            if (v4 && !net.internal) {
                out.push(net.address);
            }
        }
    }
    return out;
}

app.listen(PORT, '0.0.0.0', () => {
    writePublicVersionInfoFile();
    console.log(`\n=== P2P Image Editor Server ===`);
    console.log(`Local: http://localhost:${PORT}`);
    const lan = lanIPv4Addresses();
    if (lan.length) {
        for (const addr of lan) {
            console.log(`Network: http://${addr}:${PORT}`);
        }
    } else {
        console.log('Network: (未发现非回环 IPv4，请用 ip addr 查看本机地址)');
    }
    console.log(`ComfyUI: ${COMFYUI_URL}`);
    console.log(`================================\n`);
});
