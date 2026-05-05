package ohos_app_cangjie_entry

import kit.ArkUI.*
import ohos.arkui.state_macro_manage.*
import std.convert.*
import std.fs.*

@Component
class EditorPage {
    @Prop var accessCode: String
    @Prop var currentLang: String
    @Prop var editorMainMode: String
    @Prop var editorEditWorkflow: String
    @Prop var modeBarTopVp: Float64
    @Prop var scrollPadTopVp: Float64
    @Prop var barSideInsetVp: Float64
    @Prop var bottomBarOverlapVp: Float64
    var onEditorMainModeChange: (String) -> Unit = { _: String => }
    var onEditorEditWorkflowChange: (String) -> Unit = { _: String => }
    var onCreditsChange: (Int64) -> Unit = { _: Int64 => }
    @State var promptText: String = ""
    @State var negativePrompt: String = ""
    @State var genPrompt: String = ""
    @State var pasteImageUrl: String = ""
    @State var sourceImageUrl: String = ""
    @State var resultImageUrl: String = ""
    @State var resultRemoteUrl: String = ""
    @State var taskMessage: String = ""
    @State var isTaskError: Bool = false
    @State var isProcessing: Bool = false
    @State var showResult: Bool = false
    @State var hasImage: Bool = false
    @State var progress: Int64 = 0
    @State var genPreviewSeq: Int64 = 0
    @State var genWidth: Int64 = 1024
    @State var genHeight: Int64 = 1024
    @State var genSteps: Int64 = 4
    @State var genCfg: Float64 = 1.0

    func tr(zh: String, en: String): String { if (this.currentLang == "zh") { zh } else { en } }

    func build() {
        Stack(alignContent: Alignment.TopStart) {
            Scroll() {
                Column {
                    if (!this.taskMessage.isEmpty()) { this.buildMessage() }
                    if (this.editorMainMode == "edit") { this.buildEditPage() } else { this.buildGeneratePage() }
                    if (this.showResult) { this.buildResult() }
                }.width(100.percent).padding(left: 16, right: 16, top: this.scrollPadTopVp, bottom: this.bottomBarOverlapVp)
            }.width(100.percent).height(100.percent).scrollBar(BarState.Off).backgroundColor(0xFFF0F3FA)
            Row {
                this.modeButton(this.tr("编辑", "Edit"), "edit")
                Blank().width(10)
                this.modeButton(this.tr("生成", "Generate"), "generate")
            }.width(100.percent).padding(left: this.barSideInsetVp, right: this.barSideInsetVp, top: this.modeBarTopVp).zIndex(16)
        }.width(100.percent).height(100.percent).backgroundColor(0xFFF0F3FA)
    }

    @Builder
    func modeButton(label: String, mode: String) {
        Button(label).layoutWeight(1).height(44).fontSize(14).fontColor(if (this.editorMainMode == mode) { 0xFF007AFF } else { 0xFF63636B }).backgroundColor(if (this.editorMainMode == mode) { 0xFFFFFFFF } else { 0xE6FFFFFF }).borderRadius(14).onClick({ _: ClickEvent => this.onEditorMainModeChange(mode) })
    }

    @Builder
    func buildMessage() {
        Text(this.taskMessage).fontSize(13).fontColor(if (this.isTaskError) { 0xFFFF3B30 } else { 0xFF007AFF }).width(100.percent).padding(12).backgroundColor(0xFFFFFFFF).borderRadius(8).margin(top: 12, bottom: 8)
    }

    @Builder
    func buildEditPage() {
        Column {
            Row { this.workflowButton(this.tr("风格", "Style"), "style"); this.workflowButton(this.tr("高清", "HD"), "upscale"); this.workflowButton(this.tr("背景", "BG"), "background") }.width(100.percent).margin(top: 12, bottom: 12)
            if (!this.hasImage) {
                Button(this.tr("加载演示图片", "Load demo image")).height(42).width(100.percent).fontColor(0xFF007AFF).backgroundColor(0xFFFFFFFF).borderRadius(12).onClick({ _: ClickEvent => this.loadDemoEditImage() })
                TextInput(placeholder: this.tr("粘贴图片 URL", "Paste image URL"), text: "${this.pasteImageUrl}").height(42).width(100.percent).margin(top: 10).backgroundColor(0xFFFFFFFF).borderRadius(12).padding(left: 12, right: 12).onChange({ v: String => this.pasteImageUrl = v })
                Button(this.tr("使用 URL", "Use URL")).height(40).width(100.percent).margin(top: 8).backgroundColor(0xFFE8F3FF).fontColor(0xFF007AFF).borderRadius(12).onClick({ _: ClickEvent => this.applyPastedImageUrl() })
            } else {
                Image(this.sourceImageUrl).width(100.percent).height(150).objectFit(ImageFit.Cover).borderRadius(12)
                Button(this.tr("移除图片", "Remove image")).height(36).margin(top: 8).backgroundColor(0xFFFF3B30).fontColor(0xFFFFFFFF).borderRadius(18).onClick({ _: ClickEvent => this.clearLoadedImage() })
            }
            TextArea(placeholder: this.tr("编辑提示词", "Edit prompt"), text: "${this.promptText}").height(120).width(100.percent).margin(top: 14).backgroundColor(0xFFFFFFFF).borderRadius(12).padding(12).onChange({ v: String => this.promptText = v })
            TextInput(placeholder: this.tr("反向提示词", "Negative prompt"), text: "${this.negativePrompt}").height(42).width(100.percent).margin(top: 10).backgroundColor(0xFFFFFFFF).borderRadius(12).padding(left: 12, right: 12).onChange({ v: String => this.negativePrompt = v })
            Button(if (this.isProcessing) { this.tr("处理中...", "Processing...") } else { this.tr("编辑图片", "Edit image") }).height(48).width(100.percent).margin(top: 16).enabled(!this.isProcessing).backgroundColor(0xFF007AFF).fontColor(0xFFFFFFFF).borderRadius(24).onClick({ _: ClickEvent => this.handleEditImage() })
            if (this.isProcessing) { this.buildProgressBar() }
        }.width(100.percent)
    }

    @Builder
    func workflowButton(label: String, mode: String) {
        Button(label).layoutWeight(1).height(36).margin(right: 8).fontSize(13).fontColor(if (this.editorEditWorkflow == mode) { 0xFFFFFFFF } else { 0xFF007AFF }).backgroundColor(if (this.editorEditWorkflow == mode) { 0xFF007AFF } else { 0xFFFFFFFF }).borderRadius(16).onClick({ _: ClickEvent => this.onEditorEditWorkflowChange(mode) })
    }

    @Builder
    func buildGeneratePage() {
        Column {
            TextArea(placeholder: this.tr("描述想生成的图片", "Describe the image"), text: "${this.genPrompt}").height(130).width(100.percent).margin(top: 12).backgroundColor(0xFFFFFFFF).borderRadius(12).padding(12).onChange({ v: String => this.genPrompt = v })
            this.intInput(this.tr("宽度", "Width"), "${this.genWidth}", { v: Int64 => this.genWidth = v })
            this.intInput(this.tr("高度", "Height"), "${this.genHeight}", { v: Int64 => this.genHeight = v })
            this.intInput(this.tr("步数", "Steps"), "${this.genSteps}", { v: Int64 => this.genSteps = v })
            Row {
                Text("CFG").width(70).fontSize(14)
                TextInput(text: "${this.genCfg}").layoutWeight(1).height(40).backgroundColor(0xFFFFFFFF).borderRadius(8).padding(left: 10, right: 10).onChange({ s: String => if (let Some(v) <- Float64.tryParse(s.trimAscii()) && v > 0.0) { this.genCfg = v } })
            }.width(100.percent).margin(top: 8)
            Button(if (this.isProcessing) { this.tr("生成中...", "Generating...") } else { this.tr("生成图片", "Generate image") }).height(48).width(100.percent).margin(top: 16).enabled(!this.isProcessing).backgroundColor(0xFF007AFF).fontColor(0xFFFFFFFF).borderRadius(24).onClick({ _: ClickEvent => this.handleGenerate() })
            if (this.isProcessing) { this.buildProgressBar() }
        }.width(100.percent)
    }

    @Builder
    func intInput(label: String, value: String, apply: (Int64) -> Unit) {
        Row {
            Text(label).width(70).fontSize(14)
            TextInput(text: value).layoutWeight(1).height(40).backgroundColor(0xFFFFFFFF).borderRadius(8).padding(left: 10, right: 10).onChange({ s: String => if (let Some(v) <- Int64.tryParse(s.trimAscii()) && v > 0) { apply(v) } })
        }.width(100.percent).margin(top: 8)
    }

    @Builder
    func buildResult() {
        Column {
            Text(this.tr("结果", "Result")).fontSize(18).fontWeight(FontWeight.Bold).margin(top: 24, bottom: 12)
            if (!this.resultImageUrl.isEmpty()) { Image(this.resultImageUrl).width(100.percent).height(420).objectFit(ImageFit.Contain).borderRadius(12).backgroundColor(0xFFFFFFFF) }
            Row {
                Button(this.tr("下载", "Download")).layoutWeight(1).height(40).backgroundColor(0xFF007AFF).fontColor(0xFFFFFFFF).borderRadius(20).onClick({ _: ClickEvent => this.handleDownloadResult() })
                Blank().width(8)
                Button(this.tr("清除", "Clear")).layoutWeight(1).height(40).backgroundColor(0xFFFFFFFF).fontColor(0xFF007AFF).borderRadius(20).onClick({ _: ClickEvent => this.resetGenerateResult() })
            }.width(100.percent).margin(top: 14, bottom: 24)
        }.width(100.percent).alignItems(HorizontalAlign.Center)
    }

    @Builder
    func buildProgressBar() {
        Column { Progress(value: Float64(this.progress), total: 100.0).width(100.percent).margin(top: 12); Text("${this.progress}%").fontSize(13).fontColor(0xFF007AFF).margin(top: 4) }.width(100.percent).alignItems(HorizontalAlign.Center)
    }

    func loadDemoEditImage(): Unit { this.sourceImageUrl = IMAGE_FORGE_DEMO_EDIT_URL; this.hasImage = true; this.taskMessage = "" }
    func clearLoadedImage(): Unit { this.hasImage = false; this.sourceImageUrl = ""; this.pasteImageUrl = "" }
    func resetGenerateResult(): Unit { this.showResult = false; this.resultImageUrl = ""; this.resultRemoteUrl = "" }
    func forgeDisplayUri(filesPath: String): String { "file://${filesPath}" }
    func stripFileUriPath(uri: String): String { if (uri.startsWith("file://")) { uri[7..uri.size] } else { uri } }
    func primaryResultRemote(r: ImageTaskResult): String { if (!r.imageUrl.isEmpty()) { r.imageUrl } else { r.thumbnailUrl } }
    func historyTitle(): String { if (this.editorMainMode == "edit") { this.tr("编辑图片", "Edited image") } else { this.tr("生成图片", "Generated image") } }

    func getWorkflowTemplate(): String {
        if (this.editorEditWorkflow == "style") { "img2img_style" } else if (this.editorEditWorkflow == "upscale") { "image_upscale" } else { "background_repaint" }
    }

    func composeEditPrompt(): String {
        var p = this.promptText.trimAscii()
        let neg = this.negativePrompt.trimAscii()
        if (!neg.isEmpty()) { p = p + this.tr(" 反向提示词：", " Negative: ") + neg }
        return p
    }

    func applyPastedImageUrl(): Unit {
        let u = this.pasteImageUrl.trimAscii()
        if (u.isEmpty() || (!u.startsWith("http://") && !u.startsWith("https://"))) { this.taskMessage = this.tr("请输入 http/https 图片 URL", "Please enter an http/https image URL"); this.isTaskError = true; return }
        this.sourceImageUrl = u; this.hasImage = true; this.taskMessage = ""; this.isTaskError = false
    }

    func fail(message: String): Unit {
        this.isProcessing = false; this.progress = 0; this.showResult = false; this.taskMessage = message; this.isTaskError = true
    }

    func handleEditImage() {
        let fullPrompt = this.composeEditPrompt()
        if (fullPrompt.isEmpty()) { this.fail(this.tr("请输入编辑提示词", "Please enter an edit prompt")); return }
        if (!this.hasImage || this.sourceImageUrl.isEmpty()) { this.fail(this.tr("请加载图片", "Please load an image")); return }
        if (this.accessCode.isEmpty()) { this.fail(this.tr("访问码为空", "Access code is empty")); return }
        this.isProcessing = true; this.progress = 5; this.showResult = false; this.resultImageUrl = ""; this.resultRemoteUrl = ""; this.taskMessage = this.tr("正在下载图片...", "Downloading image..."); this.isTaskError = false
        apiDownloadImageBytes(this.sourceImageUrl, {
            bytes: Array<Byte> =>
                if (bytes.size == 0) { this.fail(this.tr("图片下载失败", "Image download failed")); return }
                this.progress = 38; this.taskMessage = this.tr("正在提交编辑任务...", "Submitting edit...")
                apiEditImage(this.accessCode, fullPrompt, this.getWorkflowTemplate(), bytes, {
                    result: ImageTaskResult =>
                        this.progress = 100; this.isProcessing = false; this.showResult = true; this.resultRemoteUrl = this.primaryResultRemote(result); this.resultImageUrl = this.resultRemoteUrl; this.taskMessage = this.tr("编辑完成", "Edit complete"); this.isTaskError = false; this.onCreditsChange(result.creditsRemaining); imageForgeHistoryAppendRecord(this.historyTitle(), fullPrompt, this.resultRemoteUrl)
                }, { message: String => this.fail(message) })
        }, { message: String => this.fail(message) })
    }

    func handleGenerate() {
        this.genPrompt = this.genPrompt.trimAscii()
        if (this.genPrompt.isEmpty()) { this.fail(this.tr("请输入提示词", "Please enter a prompt")); return }
        if (this.accessCode.isEmpty()) { this.fail(this.tr("访问码为空", "Access code is empty")); return }
        this.isProcessing = true; this.progress = 8; this.resultImageUrl = ""; this.resultRemoteUrl = ""; this.showResult = false; this.taskMessage = this.tr("生成中...", "Generating..."); this.isTaskError = false
        apiGenerateImage(this.accessCode, this.genPrompt, this.genWidth, this.genHeight, this.genSteps, this.genCfg, {
            result: ImageTaskResult =>
                let remote = this.primaryResultRemote(result)
                if (remote.isEmpty()) { this.fail(this.tr("未返回图片 URL", "No image URL returned")); return }
                this.resultRemoteUrl = remote; this.progress = 60; this.finalizeGeneratePreview(result, remote)
        }, { message: String => this.fail(message) })
    }

    func finalizeGeneratePreview(r: ImageTaskResult, remote: String): Unit {
        this.genPreviewSeq += 1
        apiDownloadImageBytes(remote, {
            bytes: Array<Byte> =>
                match (forgeTrySaveImageBytes(bytes, "ImageForge_gen_${this.genPreviewSeq}.png")) {
                    case Some(path) => this.resultImageUrl = this.forgeDisplayUri(path)
                    case None => this.resultImageUrl = remote
                }
                this.progress = 100; this.isProcessing = false; this.showResult = true; this.taskMessage = this.tr("生成完成", "Generate complete"); this.isTaskError = false; this.onCreditsChange(r.creditsRemaining); imageForgeHistoryAppendRecord(this.historyTitle(), this.genPrompt, remote)
        }, { _: String => this.resultImageUrl = remote; this.progress = 100; this.isProcessing = false; this.showResult = true; imageForgeHistoryAppendRecord(this.historyTitle(), this.genPrompt, remote) })
    }

    func handleDownloadResult(): Unit {
        let fetchUrl = if (!this.resultRemoteUrl.isEmpty()) { this.resultRemoteUrl } else if (this.resultImageUrl.startsWith("http://") || this.resultImageUrl.startsWith("https://")) { this.resultImageUrl } else { "" }
        if (!fetchUrl.isEmpty()) {
            apiDownloadImageBytes(fetchUrl, { bytes: Array<Byte> => match (forgeTrySaveImageBytes(bytes, "ImageForge_download.png")) { case Some(path) => this.taskMessage = this.tr("已保存：", "Saved: ") + path; case None => this.fail(this.tr("保存失败", "Save failed")) } }, { message: String => this.fail(message) })
            return
        }
        try {
            let bytes = File.readFrom(this.stripFileUriPath(this.resultImageUrl))
            match (forgeTrySaveImageBytes(bytes, "ImageForge_download.png")) { case Some(path) => this.taskMessage = this.tr("已保存：", "Saved: ") + path; case None => this.fail(this.tr("保存失败", "Save failed")) }
        } catch (_: Exception) { this.fail(this.tr("读取预览文件失败", "Read preview file failed")) }
    }
}
