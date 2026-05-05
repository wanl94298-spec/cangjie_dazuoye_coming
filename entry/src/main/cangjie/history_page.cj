package ohos_app_cangjie_entry

import kit.ArkUI.*
import ohos.arkui.state_macro_manage.*
import std.regex.*

@Component
class HistoryPage {
    @Prop
    var currentLang: String
    @Prop
    var contentTopInset: Float64
    @Prop
    var bottomBarOverlapVp: Float64
    @StorageProp["imageForgeHistoryLines"]
    let historyBlob: String = ""
    @State
    var showPreview: Bool = false
    @State
    var previewImageUri: String = ""
    @State
    var refreshNonce: Int64 = 0

    func tr(zh: String, en: String): String { if (this.currentLang == "zh") { zh } else { en } }

    func historyLines(): Array<String> {
        let _ = this.refreshNonce
        let _ = this.historyBlob.size
        if (this.historyBlob.isEmpty()) {
            return []
        }
        return Regex("\n").split(this.historyBlob)
    }

    func parsedRow(line: String): ParsedHistoryCard {
        imageForgeParseHistoryLine(this.currentLang, line)
    }

    func openPreview(uri: String): Unit {
        let u = uri.trimAscii()
        if (u.isEmpty() || !imageForgeLooksLikeImageUrl(u)) {
            return
        }
        this.previewImageUri = u
        this.showPreview = true
    }

    func closePreview(): Unit {
        this.showPreview = false
        this.previewImageUri = ""
    }

    func build() {
        Stack(alignContent: Alignment.TopStart) {
            Column {
                Row {
                    Text(this.tr("历史记录", "History"))
                        .fontSize(22)
                        .fontWeight(FontWeight.Bold)
                        .fontColor(0xFF1D1D1F)

                    Blank()

                    Button(this.tr("刷新", "Refresh"))
                        .shape(ButtonType.Capsule)
                        .height(32)
                        .fontSize(13)
                        .fontColor(0xFF007AFF)
                        .backgroundColor(0xFFFFFFFF)
                        .borderWidth(1)
                        .borderColor(0xFFE5E5EA)
                        .margin(right: 12)
                        .onClick({ _: ClickEvent => this.refreshNonce += 1 })

                    Text(this.tr("仅保存在本设备", "Stored on this device only")).fontSize(12).fontColor(0xFF86868B)
                }
                .width(100.percent)
                .padding(top: 16, bottom: 12)

                if (this.historyLines().size == 0) {
                    this.buildEmptyState()
                } else {
                    this.buildHistoryList()
                }
            }
            .width(100.percent)
            .height(100.percent)
            .padding(
                left: 16,
                right: 16,
                top: this.contentTopInset,
                bottom: this.bottomBarOverlapVp
            )
            .backgroundColor(0xFFF0F3FA)

            if (this.showPreview && !this.previewImageUri.isEmpty()) {
                this.buildPreviewOverlay()
            }
        }
        .width(100.percent)
        .height(100.percent)
    }

    @Builder
    func buildPreviewOverlay() {
        Stack(alignContent: Alignment.Center) {
            Column {}
                .width(100.percent)
                .height(100.percent)
                .backgroundColor(0xE6000000)
                .onClick({ _: ClickEvent => this.closePreview() })

            Column {
                Text(this.tr("预览", "Preview"))
                    .fontSize(16)
                    .fontWeight(FontWeight.Medium)
                    .fontColor(0xFFFFFFFF)
                    .margin(bottom: 14)

                Image(this.previewImageUri)
                    .width(94.percent)
                    .height(460)
                    .objectFit(ImageFit.Contain)

                Button(this.tr("关闭", "Close"))
                    .shape(ButtonType.Capsule)
                    .margin(top: 18)
                    .fontSize(14)
                    .backgroundColor(0xFF007AFF)
                    .fontColor(0xFFFFFFFF)
                    .onClick({ _: ClickEvent => this.closePreview() })
            }
            .width(94.percent)
            .padding(bottom: 28)
        }
            .width(100.percent)
            .height(100.percent)
            .zIndex(100)
    }

    @Builder
    func buildEmptyState() {
        Column {
            Blank().height(80)

            Text(this.tr("暂无已完成任务", "No completed tasks yet"))
                .fontSize(16)
                .fontColor(0xFF86868B)

            Text(this.tr("完成图片编辑或生成后，结果会自动保存在此处", "Completed edits or generations will be saved here"))
                .fontSize(13)
                .fontColor(0xFFAEAEB2)
                .margin(top: 8)
                .textAlign(TextAlign.Center)
        }
        .width(100.percent)
        .alignItems(HorizontalAlign.Center)
        .layoutWeight(1)
    }

    @Builder
    func buildHistoryList() {
        List() {
            ForEach(this.historyLines(), itemGenerator: { line: String, _: Int64 =>
                ListItem() {
                    Row {
                        if (!this.parsedRow(line).imageUrl.isEmpty()) {
                            Image(this.parsedRow(line).imageUrl)
                                .width(92)
                                .height(92)
                                .borderRadius(12)
                                .objectFit(ImageFit.Cover)
                                .margin(right: 14)
                        } else {
                            Column {
                                Text(this.tr("无图", "No img"))
                                    .fontSize(12)
                                    .fontColor(0xFFAEAEB2)
                            }
                                .width(92)
                                .height(92)
                                .borderRadius(12)
                                .backgroundColor(0xFFE8E8ED)
                                .justifyContent(FlexAlign.Center)
                                .alignItems(HorizontalAlign.Center)
                                .margin(right: 14)
                        }

                        Column {
                            Text(if (!this.parsedRow(line).cardTitle.isEmpty()) {
                                this.parsedRow(line).cardTitle
                            } else {
                                this.tr("任务记录", "Task")
                            })
                                .fontSize(15)
                                .fontWeight(FontWeight.Medium)
                                .fontColor(0xFF1D1D1F)
                                .maxLines(1)
                                .textOverflow(TextOverflow.Ellipsis)
                                .width(100.percent)

                            Text(this.parsedRow(line).promptPreview)
                                .fontSize(13)
                                .fontColor(0xFF636366)
                                .margin(top: 6)
                                .maxLines(2)
                                .textOverflow(TextOverflow.Ellipsis)
                                .width(100.percent)

                            Text(this.parsedRow(line).timeLabel)
                                .fontSize(11)
                                .fontColor(0xFFAEAEB2)
                                .margin(top: 8)
                                .width(100.percent)
                        }
                        .alignItems(HorizontalAlign.Start)
                        .layoutWeight(1)
                        .justifyContent(FlexAlign.Center)
                    }
                    .width(100.percent)
                    .padding(14)
                    .backgroundColor(0xFFFFFFFF)
                    .borderRadius(14)
                    .borderWidth(1)
                    .borderColor(0xFFE5E5EA)
                    .margin(bottom: 10)
                    .shadow(radius: 8.0, color: 0x0F000000, offsetX: 0.0, offsetY: 3.0)
                    .onClick({ _: ClickEvent => this.openPreview(this.parsedRow(line).imageUrl) })
                }
            })
        }
            .id("${this.refreshNonce}_${this.historyBlob.size}")
            .width(100.percent)
            .layoutWeight(1)
    }
}
