package ohos_app_cangjie_entry

import kit.ArkUI.*
import ohos.arkui.state_macro_manage.*
import ohos.arkui.state_management.*
import std.convert.*

@Entry
@Component
class EntryView {
    @State var currentTabIndex: Int32 = 0
    @State var editorMainMode: String = "edit"
    @State var editorEditWorkflow: String = "style"
    @State var accessCode: String = ""
    @State var isLoggedIn: Bool = false
    @State var userName: String = "User"
    @State var credits: Int64 = 0
    @State var currentLang: String = "zh"
    @State var loginMessage: String = ""
    @State var isLoggingIn: Bool = false

    func safeVp(key: String): Float64 {
        if (!AppStorage.has(key)) { return 0.0 }
        let s = AppStorage.get<String>(key).getOrThrow()
        if (s.isEmpty() || s == "0") { return 0.0 }
        match (this.getUIContext().px2vp(Float64.parse(s).px)) { case Some(v) => return v.value; case None => return 0.0 }
    }

    func getTopSafeHeight(): Float64 { this.safeVp("topHeight") }
    func getBottomSafeHeight(): Float64 { this.safeVp("bottomHeight") }
    func mainSideInsetVp(): Float64 { 16.0 }
    func mainHeaderReserveVp(): Float64 { 8.0 + this.getTopSafeHeight() + 52.0 }
    func mainScrollBottomInsetVp(): Float64 { 24.0 }
    func pickLang(zh: String, en: String): String { if (this.currentLang == "zh") { zh } else { en } }
    func languageSwitchLabel(): String { this.pickLang("中文", "English") }

    func build() {
        Column { if (!this.isLoggedIn) { this.buildLoginPage() } else { this.buildMainPage() } }
            .width(100.percent).height(100.percent).backgroundColor(0xFFF0F3FA).expandSafeArea(types: [SafeAreaType.System], edges: [SafeAreaEdge.Top, SafeAreaEdge.Bottom])
    }

    @Builder
    func buildLoginPage() {
        Column {
            Blank()
            Text("ImageForge").fontSize(34).fontWeight(FontWeight.Bold).fontColor(0xFF1D1D1F).margin(bottom: 8)
            Text(this.pickLang("AI 图片编辑与生成", "AI image editing and generation")).fontSize(15).fontColor(0xFF6E6E73).margin(bottom: 24)
            TextInput(placeholder: this.pickLang("访问码", "Access code"), text: "${this.accessCode}").height(52).width(88.percent).backgroundColor(0xFFFFFFFF).borderRadius(14).padding(left: 16, right: 16).onChange({ v: String => this.accessCode = v; this.loginMessage = "" })
            if (!this.loginMessage.isEmpty()) { Text(this.loginMessage).fontSize(13).fontColor(0xFFFF3B30).margin(top: 12) }
            Button(if (this.isLoggingIn) { this.pickLang("检查中...", "Checking...") } else { this.pickLang("登录", "Sign in") }).width(88.percent).height(52).margin(top: 18).enabled(!this.isLoggingIn).backgroundColor(0xFF007AFF).fontColor(0xFFFFFFFF).borderRadius(26).onClick({ _: ClickEvent => this.handleLogin() })
            Blank()
            Button(this.languageSwitchLabel()).height(36).margin(bottom: 24.0 + this.getBottomSafeHeight()).backgroundColor(0xFFFFFFFF).fontColor(0xFF007AFF).borderRadius(18).onClick({ _: ClickEvent => this.toggleLanguage() })
        }.width(100.percent).height(100.percent).alignItems(HorizontalAlign.Center).padding(left: 16, right: 16, top: this.getTopSafeHeight())
    }

    @Builder
    func buildMainPage() {
        Column {
            Stack(alignContent: Alignment.TopStart) {
                if (this.currentTabIndex == 0) {
                    HomePage(currentLang: this.currentLang, contentTopInset: this.mainHeaderReserveVp(), hMarginVp: this.mainSideInsetVp(), bottomBarOverlapVp: this.mainScrollBottomInsetVp(), onOpenEditor: { m: String, w: String => this.editorMainMode = m; this.editorEditWorkflow = w; this.currentTabIndex = 1 })
                } else if (this.currentTabIndex == 1) {
                    EditorPage(accessCode: this.accessCode, currentLang: this.currentLang, editorMainMode: this.editorMainMode, editorEditWorkflow: this.editorEditWorkflow, modeBarTopVp: this.mainHeaderReserveVp() + 4.0, scrollPadTopVp: this.mainHeaderReserveVp() + 78.0, barSideInsetVp: this.mainSideInsetVp(), bottomBarOverlapVp: this.mainScrollBottomInsetVp(), onEditorMainModeChange: { m: String => this.editorMainMode = m }, onEditorEditWorkflowChange: { w: String => this.editorEditWorkflow = w }, onCreditsChange: { c: Int64 => if (c >= 0) { this.credits = c } })
                } else if (this.currentTabIndex == 2) {
                    HistoryPage(currentLang: this.currentLang, contentTopInset: this.mainHeaderReserveVp(), bottomBarOverlapVp: this.mainScrollBottomInsetVp())
                } else {
                    SettingsPage(currentLang: this.currentLang, contentTopInset: this.mainHeaderReserveVp(), bottomBarOverlapVp: this.mainScrollBottomInsetVp())
                }
                this.buildTopBar()
            }.layoutWeight(1).width(100.percent)
            this.buildBottomBar()
        }.width(100.percent).height(100.percent).backgroundColor(0xFFF0F3FA)
    }

    @Builder
    func buildTopBar() {
        Row {
            Text(this.userName).fontSize(20).fontWeight(FontWeight.Bold).fontColor(0xFF1D1D1F)
            Blank()
            Text("${this.credits} ${this.pickLang("积分", "credits")}").fontSize(13).fontColor(0xFF0F2A4A).padding(left: 12, right: 12, top: 8, bottom: 8).backgroundColor(0xFFFFFFFF).borderRadius(18)
            Button(this.languageSwitchLabel()).height(32).fontSize(13).fontColor(0xFF007AFF).padding(left: 12, right: 12, top: 6, bottom: 6).margin(left: 8).backgroundColor(0xFFFFFFFF).borderRadius(18).onClick({ _: ClickEvent => this.toggleLanguage() })
        }.width(100.percent).padding(left: this.mainSideInsetVp(), right: this.mainSideInsetVp(), top: 10.0 + this.getTopSafeHeight(), bottom: 10).backgroundColor(0xE6F0F3FA).zIndex(24)
    }

    @Builder
    func buildBottomBar() {
        Row {
            this.navButton(0)
            this.navButton(1)
            this.navButton(2)
            this.navButton(3)
        }.width(100.percent).height(58).padding(left: 8, right: 8).margin(left: this.mainSideInsetVp(), right: this.mainSideInsetVp(), bottom: 12.0 + this.getBottomSafeHeight()).backgroundColor(0xFFFFFFFF).borderRadius(24)
    }

    func navLabel(index: Int32): String {
        if (index == 0) { return this.pickLang("首页", "Home") }
        if (index == 1) { return this.pickLang("创作", "Create") }
        if (index == 2) { return this.pickLang("历史", "History") }
        return this.pickLang("设置", "Settings")
    }

    @Builder
    func navButton(index: Int32) {
        Button(this.navLabel(index)).layoutWeight(1).height(44).fontSize(12).fontColor(if (this.currentTabIndex == index) { 0xFFFFFFFF } else { 0xFF007AFF }).backgroundColor(if (this.currentTabIndex == index) { 0xFF007AFF } else { 0x00FFFFFF }).borderRadius(20).onClick({ _: ClickEvent => this.currentTabIndex = index })
    }

    func handleLogin() {
        this.accessCode = this.accessCode.trimAscii()
        if (this.accessCode.isEmpty()) { this.loginMessage = this.pickLang("请输入访问码", "Please enter access code"); return }
        if (this.isLoggingIn) { return }
        this.isLoggingIn = true; this.loginMessage = this.pickLang("检查中...", "Checking...")
        apiLogin(this.accessCode, {
            user: UserInfo => this.userName = user.username; this.credits = user.credits; this.isLoggedIn = true; this.isLoggingIn = false; this.loginMessage = ""
        }, {
            message: String => this.isLoggingIn = false; this.loginMessage = message
        })
    }

    func toggleLanguage(): Unit { this.currentLang = if (this.currentLang == "zh") { "en" } else { "zh" } }
}
