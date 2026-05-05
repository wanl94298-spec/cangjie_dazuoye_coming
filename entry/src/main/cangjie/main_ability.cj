package ohos_app_cangjie_entry

import kit.PerformanceAnalysisKit.Hilog
import kit.AbilityKit.Want
import kit.AbilityKit.UIAbility
import kit.AbilityKit.LaunchParam
import kit.AbilityKit.LaunchReason
import kit.ArkUI.*
import ohos.arkui.state_management.*

class MainAbility <: UIAbility {
    public init() {
        super()
        registerSelf()
    }

    public override func onCreate(want: Want, launchParam: LaunchParam): Unit {
        Hilog.info(1, "Cangjie", "MainAbility OnCreated.${want.abilityName}")
        match (launchParam.launchReason) {
            case LaunchReason.StartAbility => Hilog.info(1, "Cangjie", "START_ABILITY")
            case _ => ()
        }
    }

    public override func onWindowStageCreate(windowStage: WindowStage): Unit {
        Hilog.info(1, "Cangjie", "MainAbility onWindowStageCreate.")
        let mainWindow = windowStage.getMainWindow()
        mainWindow.setWindowLayoutFullScreen(true)

        let topArea = mainWindow.getWindowAvoidArea(AvoidAreaType.TypeSystem)
        AppStorage.setOrCreate("topHeight", topArea.topRect.height.toString())

        let bottomArea = mainWindow.getWindowAvoidArea(AvoidAreaType.TypeNavigationIndicator)
        AppStorage.setOrCreate("bottomHeight", bottomArea.bottomRect.height.toString())

        /// 应用文件目录，供创作页「下载」写入本地 PNG（需与 EditorPage 保存逻辑一致）
        AppStorage.setOrCreate("forgeFilesDir", this.context.filesDir)

        windowStage.loadContent("EntryView")
    }
}
