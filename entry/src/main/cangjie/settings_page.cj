package ohos_app_cangjie_entry

import kit.ArkUI.*
import ohos.arkui.state_macro_manage.*
import ohos.arkui.state_management.*

@Component
class SettingsPage {
    @Prop
    var currentLang: String
    @Prop
    var contentTopInset: Float64
    @Prop
    var bottomBarOverlapVp: Float64
    @State
    var healthStatus: String = "—"
    @State
    var versionInfo: String = "—"
    @State
    var isChecking: Bool = false

    func tr(zh: String, en: String): String { if (this.currentLang == "zh") { zh } else { en } }

    func build() {
        Scroll() {
            Column {
                Text(this.tr("设置", "Settings"))
                    .fontSize(22)
                    .fontWeight(FontWeight.Bold)
                    .fontColor(0xFF1D1D1F)
                    .width(100.percent)
                    .margin(top: 16, bottom: 16)

                this.buildHealthBlock()

                this.buildVersionBlock()

                this.buildArchBlock()

                this.buildDataBlock()
            }.width(100.percent).padding(left: 16, right: 16, bottom: this.bottomBarOverlapVp)
        }
        .width(100.percent)
        .height(100.percent)
        .padding(top: this.contentTopInset)
        .scrollBar(BarState.Off)
        .backgroundColor(0xFFF0F3FA)
    }

    @Builder
    func buildHealthBlock() {
        Column {
            Text(this.tr("连通性", "Connectivity")).fontSize(17).fontWeight(FontWeight.Bold).fontColor(0xFF1D1D1F).margin(bottom: 8)

            Text(this.tr("检测 Web 服务与 ComfyUI（服务端转发）。", "Check the Web service and ComfyUI through the server.")).fontSize(14).fontColor(0xFF86868B).margin(bottom: 12)

            Button(this.getHealthCheckButtonLabel())
                .shape(ButtonType.Capsule)
                .height(40)
                .backgroundColor(0xD9FFFFFF)
                .backdropBlur(14.0)
                .fontColor(0xFF007AFF)
                .fontSize(14)
                .borderWidth(1)
                .borderColor(0x59FFFFFF)
                .enabled(!this.isChecking)
                .onClick({
                    _: ClickEvent => this.handleHealthCheck()
                })
                .margin(bottom: 12)

            Text(this.healthStatus)
                .fontSize(13)
                .fontColor(0xFF86868B)
                .width(100.percent)
                .padding(12)
                .backgroundColor(0xCCFFFFFF)
                .backdropBlur(12.0)
                .borderRadius(8)
        }
            .width(100.percent)
            .padding(20)
            .backgroundColor(0xE6FFFFFF)
            .backdropBlur(24.0)
            .borderRadius(16)
            .borderWidth(1)
            .borderColor(0x59FFFFFF)
            .margin(bottom: 12)
            .alignItems(HorizontalAlign.Start)
    }

    @Builder
    func buildVersionBlock() {
        Column {
            Text(this.tr("版本信息", "Version")).fontSize(17).fontWeight(FontWeight.Bold).fontColor(0xFF1D1D1F).margin(bottom: 8)

            Text(this.versionInfo)
                .fontSize(13)
                .fontColor(0xFF86868B)
                .width(100.percent)
                .padding(12)
                .backgroundColor(0xCCFFFFFF)
                .backdropBlur(12.0)
                .borderRadius(8)
        }
            .width(100.percent)
            .padding(20)
            .backgroundColor(0xE6FFFFFF)
            .backdropBlur(24.0)
            .borderRadius(16)
            .borderWidth(1)
            .borderColor(0x59FFFFFF)
            .margin(bottom: 12)
            .alignItems(HorizontalAlign.Start)
    }

    @Builder
    func buildArchBlock() {
        Column {
            Text(this.tr("架构说明", "Architecture")).fontSize(17).fontWeight(FontWeight.Bold).fontColor(0xFF1D1D1F).margin(bottom: 8)

            Text(this.tr("鸿蒙客户端通过 HTTP 请求 Node 服务端；ComfyUI 由服务端连接，与 Web 端对齐同一套 REST/SSE 接口契约。", "The HarmonyOS client calls the Node service by HTTP. ComfyUI is connected server-side, using the same REST/SSE contract as the Web client."))
                .fontSize(14)
                .fontColor(0xFF86868B)
                .lineHeight(22)
        }
            .width(100.percent)
            .padding(20)
            .backgroundColor(0xE6FFFFFF)
            .backdropBlur(24.0)
            .borderRadius(16)
            .borderWidth(1)
            .borderColor(0x59FFFFFF)
            .margin(bottom: 12)
            .alignItems(HorizontalAlign.Start)
    }

    @Builder
    func buildDataBlock() {
        Column {
            Text(this.tr("本地数据", "Local data")).fontSize(17).fontWeight(FontWeight.Bold).fontColor(0xFF1D1D1F).margin(bottom: 8)

            Button(this.tr("清空全部历史", "Clear all history"))
                .shape(ButtonType.Capsule)
                .height(40)
                .backgroundColor(0xE6FFFFFF)
                .backdropBlur(14.0)
                .fontColor(0xFFFF3B30)
                .fontSize(14)
                .borderWidth(1)
                .borderColor(0x99FF3B30)
                .onClick({
                    _: ClickEvent => this.handleClearHistory()
                })
        }
            .width(100.percent)
            .padding(20)
            .backgroundColor(0xE6FFFFFF)
            .backdropBlur(24.0)
            .borderRadius(16)
            .borderWidth(1)
            .borderColor(0x59FFFFFF)
            .margin(bottom: 24)
            .alignItems(HorizontalAlign.Start)
    }

    func getHealthCheckButtonLabel(): String {
        if (this.isChecking) {
            return this.tr("检查中...", "Checking...")
        } else {
            return this.tr("执行健康检查", "Run health check")
        }
    }

    func handleHealthCheck() {
        this.isChecking = true
        this.healthStatus = "正在检查 ${API_BASE_URL} ..."
        this.versionInfo = "正在读取版本信息..."

        apiCheckHealth(
            {
                result: HealthCheckResult =>
                    this.healthStatus = "服务端：${result.serverStatus}\nComfyUI：${result.comfyuiStatus}"
                    this.fetchVersionInfo()
            },
            {
                message: String =>
                    this.healthStatus = "连接失败：${message}"
                    this.fetchVersionInfo()
            }
        )
    }

    func fetchVersionInfo() {
        apiFetchVersion(
            {
                info: VersionInfo =>
                    this.versionInfo = "${info.name} v${info.version}\n角色：${info.role}\nComfyUI：${info.comfyuiUrl}"
                    this.isChecking = false
            },
            {
                message: String =>
                    this.versionInfo = "版本信息获取失败：${message}"
                    this.isChecking = false
            }
        )
    }

    func handleClearHistory() {
        AppStorage.setOrCreate("imageForgeHistoryLines", "")
        this.healthStatus = this.tr("历史记录已清空", "History cleared")
    }
}
