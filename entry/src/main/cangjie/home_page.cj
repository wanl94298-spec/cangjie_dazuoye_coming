package ohos_app_cangjie_entry

import kit.ArkUI.*
import ohos.arkui.state_macro_manage.*

@Component
class HomePage {
    @Prop var currentLang: String
    @Prop var contentTopInset: Float64
    @Prop var hMarginVp: Float64
    @Prop var bottomBarOverlapVp: Float64
    @State var scrollY: Float64 = 0.0
    var onOpenEditor: (String, String) -> Unit = { _: String, _: String => }

    func tr(zh: String, en: String): String { if (this.currentLang == "zh") { zh } else { en } }

    func blurMix(a: Float64, b: Float64, lim: Float64): Float64 {
        let r = a / b
        if (r < lim) {
            r
        } else {
            lim
        }
    }

    func build() {
        Scroll() {
            Column {
                Blank().height(6)

                Text("ImageForge")
                    .fontSize(30)
                    .fontWeight(FontWeight.Bold)
                    .fontColor(0xFF141820)
                    .margin(bottom: 6)

                Text(this.tr("AI 驱动的图片编辑与合成", "AI image editing & composition"))
                    .fontSize(15)
                    .fontWeight(FontWeight.Medium)
                    .fontColor(0xFF5C6670)
                    .lineHeight(22)
                    .margin(bottom: 22)

                this.buildFeatureCards()

                this.buildQuickActions()
            }
            .width(100.percent)
            .padding(
                left: this.hMarginVp,
                right: this.hMarginVp,
                top: this.contentTopInset,
                bottom: this.bottomBarOverlapVp
            )
            .opacity(1.0 - this.blurMix(this.scrollY, 220.0, 0.18))
            .backdropBlur(6.0 + this.blurMix(this.scrollY, 28.0, 12.0))
        }
        .width(100.percent)
        .height(100.percent)
        .scrollBar(BarState.Off)
        .backgroundColor(0xFFF0F3FA)
        .onDidScroll({
            _, yOffset: Float64, _: ScrollState =>
                this.scrollY = yOffset
        })
    }

    @Builder
    func buildFeatureCards() {
        Column {
            Row {
                this.buildGlassCard("glass_style", {
                    => this.onOpenEditor("edit", "style")
                })
                Blank().width(12)
                this.buildGlassCard("glass_upscale", {
                    => this.onOpenEditor("edit", "upscale")
                })
            }
            .width(100.percent)

            Row {
                this.buildGlassCard("glass_background", {
                    => this.onOpenEditor("edit", "background")
                })
                Blank().width(12)
                this.buildGlassCard("glass_generate", {
                    => this.onOpenEditor("generate", "style")
                })
            }
            .width(100.percent)
            .margin(top: 12)
        }
        .width(100.percent)
        .margin(bottom: 28)
    }

    /// 两列等宽、等高卡片（文案在内部 tr，保证与 currentLang 同步）
    @Builder
    func buildGlassCard(kind: String, onTap: () -> Unit) {
        Column {
            Text(
                if (kind == "glass_style") {
                    this.tr("风格化修图", "Stylized edit")
                } else if (kind == "glass_upscale") {
                    this.tr("高清增强", "HD enhance")
                } else if (kind == "glass_background") {
                    this.tr("背景重绘", "Background repaint")
                } else {
                    this.tr("文生图", "Text to image")
                }
            )
                .fontSize(16)
                .fontWeight(FontWeight.Bold)
                .fontColor(0xFF1A2430)
                .margin(bottom: 8)

            Text(
                if (kind == "glass_style") {
                    this.tr("自然语言编辑 · Flux2", "Natural language edit · Flux2")
                } else if (kind == "glass_upscale") {
                    this.tr("lanczos · 更高清细节", "lanczos · more details")
                } else if (kind == "glass_background") {
                    this.tr("CFG 与步数适配图景", "CFG and steps tuned for scenes")
                } else {
                    this.tr("文字描述生成全新图像", "Generate new images from text")
                }
            )
                .fontSize(12)
                .fontColor(0xFF6B7680)
                .maxLines(3)
                .textOverflow(TextOverflow.Ellipsis)
        }
        .layoutWeight(1)
        .height(148)
        .padding(18)
        .justifyContent(FlexAlign.Start)
        .linearGradient(
            direction: GradientDirection.RightBottom,
            colors: [(0xFFECF6FF, 0.0), (0xFFD6E8FF, 0.55), (0xFFC4DDFF, 1.0)]
        )
        .backdropBlur(22.0)
        .borderRadius(20)
        .borderWidth(1)
        .borderColor(0x66FFFFFF)
        .alignItems(HorizontalAlign.Start)
        .clip(true)
        .shadow(radius: 20.0, color: 0x16000055, offsetX: 0.0, offsetY: 8.0)
        .onClick({ _: ClickEvent => onTap() })
    }

    @Builder
    func buildQuickActions() {
        Column {
            Text(this.tr("快速开始", "Quick start"))
                .fontSize(18)
                .fontWeight(FontWeight.Bold)
                .fontColor(0xFF1A2430)
                .margin(bottom: 14)

            Button(this.tr("开始编辑图片", "Start editing"))
                .shape(ButtonType.Capsule)
                .width(100.percent)
                .height(50)
                .fontSize(16)
                .fontWeight(FontWeight.Medium)
                .fontColor(0xFF10305C)
                .linearGradient(
                    direction: GradientDirection.RightBottom,
                    colors: [(0xFFDBEEFF, 0.0), (0xFFB8CEFF, 1.0)]
                )
                .borderWidth(1)
                .borderColor(0x55FFFFFF)
                .shadow(radius: 18.0, color: 0x1800286E, offsetX: 0.0, offsetY: 6.0)
                .margin(bottom: 12)
                .onClick({ _: ClickEvent =>
                    this.onOpenEditor("edit", "style")
                })

            Button(this.tr("开始生成图片", "Start generating"))
                .shape(ButtonType.Capsule)
                .width(100.percent)
                .height(50)
                .fontSize(16)
                .fontWeight(FontWeight.Medium)
                .fontColor(0xFF10305C)
                .linearGradient(
                    direction: GradientDirection.RightBottom,
                    colors: [(0xFFE8F3FF, 0.0), (0xFFC5DBFF, 1.0)]
                )
                .borderWidth(1)
                .borderColor(0x55FFFFFF)
                .shadow(radius: 14.0, color: 0x1200286E, offsetX: 0.0, offsetY: 5.0)
                .onClick({ _: ClickEvent =>
                    this.onOpenEditor("generate", "style")
                })
        }
        .width(100.percent)
        .padding(bottom: 28)
    }
}
