package ohos_app_cangjie_entry

import kit.NetworkKit.*
import kit.ArkUI.*
import ohos.base.*
import ohos.business_exception.BusinessException
import std.collection.*
import std.convert.*
import std.regex.*
import std.fs.*
import std.fs.Path as FsPath
import std.time.*

let IMAGE_FORGE_HISTORY_KEY: String = "imageForgeHistoryLines"
/// 鍘嗗彶鍗曡瀛楁鍒嗛殧绗︼紱鏍煎紡锛氭椂闂绰锋爣棰樎锋彁绀鸿瘝路鍥剧墖鍦板潃
let IMAGE_FORGE_HISTORY_FIELD_SEP: String = "\u{001E}"
let IMAGE_FORGE_DEMO_EDIT_URL: String = "https://picsum.photos/seed/imageforge-edit/1024/768"

let API_BASE_URL: String = "https://ptp.matrixlabs.cn" // cjlint-ignore !G.OTH.03 deployed BFF endpoint
let AUTH_API_PATH: String = "/api/auth"

func runOnMainThread(task: () -> Unit): Unit {
    launch {
        task()
    }
}


func imageForgeSanitizeHistoryField(s: String): String {
    var t = Regex("\r|\n").replaceAll(s, " ")
    t = Regex("\\s+").replaceAll(t, " ").trimAscii()
    return t.replace(IMAGE_FORGE_HISTORY_FIELD_SEP, " ")
}

/// 鍐欏叆缁撴瀯鍖栧巻鍙诧紙淇濈暀瀹屾暣鍥剧墖 URL锛屼緵鍘嗗彶椤电缉鐣ュ浘涓庡ぇ鍥鹃瑙堬級
func imageForgeHistoryAppendRecord(cardTitle: String, prompt: String, imageUrl: String): Unit {
    let ts = DateTime.now().format("yyyy/MM/dd HH:mm:ss")
    let title = imageForgeSanitizeHistoryField(cardTitle)
    var p = imageForgeSanitizeHistoryField(prompt)
    if (p.size > 800) {
        p = p[0..800]
    }
    let u = imageForgeSanitizeHistoryField(imageUrl)
    if (u.isEmpty()) {
        return
    }
    let line = ts + IMAGE_FORGE_HISTORY_FIELD_SEP + title + IMAGE_FORGE_HISTORY_FIELD_SEP + p +
        IMAGE_FORGE_HISTORY_FIELD_SEP + u
    let prev = if (AppStorage.has(IMAGE_FORGE_HISTORY_KEY)) {
        match (AppStorage.get<String>(IMAGE_FORGE_HISTORY_KEY)) {
            case Some(s) => s
            case None => ""
        }
    } else {
        ""
    }
    let next = if (prev.isEmpty()) {
        line
    } else {
        line + "\n" + prev
    }
    AppStorage.setOrCreate(IMAGE_FORGE_HISTORY_KEY, next)
}

class ParsedHistoryCard {
    public var timeLabel: String = "-"
    public var cardTitle: String = ""
    public var promptPreview: String = ""
    public var imageUrl: String = ""

    public init() {}
}

func imageForgeJoinHistorySlice(parts: Array<String>, lo: Int64, hiExclusive: Int64, glue: String): String {
    if (hiExclusive <= lo) {
        return ""
    }
    var acc = parts[lo]
    var k = lo + 1
    while (k < hiExclusive) {
        acc = acc + glue + parts[k]
        k += 1
    }
    return acc
}

func imageForgeLooksLikeImageUrl(u: String): Bool {
    let t = u.trimAscii()
    return t.startsWith("https://") || t.startsWith("http://") || t.startsWith("file://")
}

func historyMapLegacyHeadToTitle(head: String, currentLang: String): String {
    if (currentLang != "zh") {
        if (head == "Generated image") {
            return "Generated image"
        }
        if (head == "编辑") {
            return "Edited image"
        }
        return head
    }
    if (head == "Generated image") {
        return "生成图片"
    }
    if (head == "编辑") {
        return "编辑图片"
    }
    return head
}

func imageForgeParseHistoryLine(currentLang: String, line: String): ParsedHistoryCard {
    let card = ParsedHistoryCard()
    let raw = line.trimAscii()
    if (raw.isEmpty()) {
        return card
    }

    if (raw.contains(IMAGE_FORGE_HISTORY_FIELD_SEP)) {
        let fields = Regex(IMAGE_FORGE_HISTORY_FIELD_SEP).split(raw)
        if (fields.size >= 4) {
            card.timeLabel = fields[0]
            card.cardTitle = fields[1]
            card.imageUrl = fields[fields.size - 1].trimAscii()
            card.promptPreview = imageForgeJoinHistorySlice(
                fields,
                2,
                fields.size - 1,
                IMAGE_FORGE_HISTORY_FIELD_SEP
            )
        } else {
            card.promptPreview = raw
        }
        return card
    }

    let dotParts = Regex(" · ").split(raw)
    if (dotParts.size >= 3 && imageForgeLooksLikeImageUrl(dotParts[dotParts.size - 1])) {
        card.cardTitle = historyMapLegacyHeadToTitle(dotParts[0], currentLang)
        card.imageUrl = dotParts[dotParts.size - 1].trimAscii()
        card.promptPreview = imageForgeJoinHistorySlice(dotParts, 1, dotParts.size - 1, " · ")
        return card
    }

    card.promptPreview = raw
    return card
}


class UserInfo {
    public var userId: String = ""
    public var username: String = ""
    public var email: String = ""
    public var plan: String = "free"
    public var planName: String = "Free"
    public var credits: Int64 = 0
    public var usedCredits: Int64 = 0
    public var editCreditCost: Int64 = 2
    public var generateCreditCost: Int64 = 1

    public init() {}

    public init(
        userId!: String,
        username!: String,
        plan!: String,
        credits!: Int64
    ) {
        this.userId = userId
        this.username = username
        this.plan = plan
        this.credits = credits
    }
}



class HealthCheckResult {
    public var serverStatus: String = "unknown"
    public var comfyuiStatus: String = "unknown"
    public var isHealthy: Bool = false

    public init() {}
}

class VersionInfo {
    public var name: String = ""
    public var version: String = ""
    public var role: String = ""
    public var comfyuiUrl: String = ""
    public var hint: String = ""

    public init() {}
}

class ImageTaskResult {
    public var imageUrl: String = ""
    public var thumbnailUrl: String = ""
    public var prompt: String = ""
    public var creditsUsed: Int64 = 0
    public var creditsRemaining: Int64 = -1

    public init() {}
}

func apiLogin(
    accessCode: String,
    onSuccess: (UserInfo) -> Unit,
    onError: (String) -> Unit
): Unit {
    apiPost(
        AUTH_API_PATH,
        "{\"accessCode\":\"${jsonEscape(accessCode)}\"}",
        {
            body: String => if (apiJsonBool(body, "success") ?? false) {
                onSuccess(parseUserInfo(body))
            } else {
                onError(apiJsonString(body, "error") ?? "登录失败")
            }
        },
        onError
    )
}

func apiGenerateImage(
    accessCode: String,
    prompt: String,
    width: Int64,
    height: Int64,
    steps: Int64,
    cfg: Float64,
    onSuccess: (ImageTaskResult) -> Unit,
    onError: (String) -> Unit
): Unit {
    let body = "{" + "\"accessCode\":\"${jsonEscape(accessCode)}\"," + "\"prompt\":\"${jsonEscape(prompt)}\"," +
        "\"width\":${width}," + "\"height\":${height}," + "\"steps\":${steps}," + "\"cfg\":${cfg}" + "}"

    apiPost(
        "/api/generate",
        body,
        {
            response: String => if (apiJsonBool(response, "success") ?? false) {
                onSuccess(parseImageTaskResult(response))
            } else {
                onError(apiJsonString(response, "error") ?? "生成失败")
            }
        },
        onError
    )
}

/// SSE `/api/generate-stream`锛氭湇鍔＄鎺ㄩ€?progress锛屽畬鎴愭椂甯﹀洖 image 绛夊瓧娈碉紙涓?API 鏂囨。涓€鑷达級


func forgeTrySaveImageBytes(bytes: Array<Byte>, fileName: String): ?String {
    if (bytes.size == 0) {
        return None<String>
    }
    let dir = if (AppStorage.has("forgeFilesDir")) {
        match (AppStorage.get<String>("forgeFilesDir")) {
            case Some(s) => s
            case None => ""
        }
    } else {
        ""
    }
    if (dir.isEmpty()) {
        return None<String>
    }
    let pathStr = if (dir.size > 0 && Int32(dir[dir.size - 1]) == 47) {
        dir + fileName
    } else {
        dir + "/" + fileName
    }
    try {
        let p = FsPath(pathStr)
        var f = File(p, Write)
        f.write(bytes)
        f.close()
        Some(pathStr)
    } catch (_: BusinessException) {
        None<String>
    }
}

func apiCheckHealth(
    onSuccess: (HealthCheckResult) -> Unit,
    onError: (String) -> Unit
): Unit {
    apiGet(
        "/api/health",
        {
            body: String =>
                let result = HealthCheckResult()
                result.serverStatus = apiJsonString(body, "status") ?? "unknown"
                result.comfyuiStatus = apiJsonString(body, "comfyui") ?? "unknown"
                result.isHealthy = result.serverStatus == "ok" && result.comfyuiStatus == "connected"
                onSuccess(result)
        },
        onError
    )
}

func apiFetchVersion(
    onSuccess: (VersionInfo) -> Unit,
    onError: (String) -> Unit
): Unit {
    apiGet(
        "/api/version",
        {
            body: String =>
                let info = VersionInfo()
                info.name = apiJsonString(body, "name") ?? ""
                info.version = apiJsonString(body, "version") ?? ""
                info.role = apiJsonString(body, "role") ?? ""
                info.comfyuiUrl = apiJsonString(body, "comfyuiUrl") ?? ""
                info.hint = apiJsonString(body, "hint") ?? ""
                onSuccess(info)
        },
        onError
    )
}

func apiGet(
    path: String,
    onSuccess: (String) -> Unit,
    onError: (String) -> Unit
): Unit {
    apiRequest(RequestMethod.Get, path, "", onSuccess, onError)
}

func apiPost(
    path: String,
    body: String,
    onSuccess: (String) -> Unit,
    onError: (String) -> Unit
): Unit {
    apiRequest(RequestMethod.Post, path, body, onSuccess, onError)
}

func httpResultToBytes(data: HttpData): Array<Byte> {
    match (data) {
        case HttpData.ArrayData(bytes) => bytes
        case _ => Array<Byte>()
    }
}

/// 按文件魔数推断 multipart 类型与文件名，与 PTP `multer` 的 `.jpg|.jpeg|.png|.webp` 校验一致
class ForgeEditMultipartMeta {
    var mime: String = "image/jpeg"
    var remoteFileName: String = "edit.jpg"

    public init(mime: String, remoteFileName: String) {
        this.mime = mime
        this.remoteFileName = remoteFileName
    }
}

func forgeInferEditMultipartMeta(bytes: Array<Byte>): ForgeEditMultipartMeta {
    if (bytes.size >= 8 &&
        Int64(bytes[0]) == 137 &&
        Int64(bytes[1]) == 80 &&
        Int64(bytes[2]) == 78 &&
        Int64(bytes[3]) == 71) {
        return ForgeEditMultipartMeta("image/png", "edit.png")
    }
    if (bytes.size >= 12 &&
        Int64(bytes[0]) == 82 &&
        Int64(bytes[1]) == 73 &&
        Int64(bytes[2]) == 70 &&
        Int64(bytes[3]) == 70 &&
        Int64(bytes[8]) == 87 &&
        Int64(bytes[9]) == 69 &&
        Int64(bytes[10]) == 66 &&
        Int64(bytes[11]) == 80) {
        return ForgeEditMultipartMeta("image/webp", "edit.webp")
    }
    if (bytes.size >= 3 && Int64(bytes[0]) == 255 && Int64(bytes[1]) == 216 && Int64(bytes[2]) == 255) {
        return ForgeEditMultipartMeta("image/jpeg", "edit.jpg")
    }
    return ForgeEditMultipartMeta("image/jpeg", "edit.jpg")
}

func apiDownloadImageBytes(
    imageUrl: String,
    onSuccess: (Array<Byte>) -> Unit,
    onError: (String) -> Unit
): Unit {
    if (imageUrl.isEmpty()) {
        runOnMainThread({ => onError("图片地址为空") })
        return
    }
    try {
        let request = createHttp()
        let headers = HashMap<String, String>()
        headers.add("Accept", "image/*,*/*")
        headers.add("User-Agent", "ImageForge-HarmonyOS/1.0")
        let options = HttpRequestOptions(
            method: RequestMethod.Get,
            extraData: HttpData.StringData(""),
            expectDataType: HttpDataType.ArrayBuffer,
            usingCache: false,
            header: headers,
            readTimeout: 120000u32,
            connectTimeout: 25000u32
        )
        try {
            request.request(
                imageUrl,
                options,
                {
                    err, resp =>
                        if (let Some(e) <- err) {
                            let message = e.message
                            runOnMainThread({
                                => onError(message)
                            })
                            safeDestroyHttpRequest(request)
                            return
                        }

                        if (let Some(r) <- resp) {
                            if (r.responseCode >= 200u32 && r.responseCode < 300u32) {
                                let bytes = httpResultToBytes(r.result)
                                if (bytes.size == 0) {
                                    runOnMainThread({
                                        => onError("未获取到图片数据")
                                    })
                                } else {
                                    runOnMainThread({
                                        => onSuccess(bytes)
                                    })
                                }
                            } else {
                                let responseBody = httpDataToString(r.result)
                                let message = apiJsonString(responseBody, "error") ?? "HTTP ${r.responseCode}"
                                runOnMainThread({
                                    => onError(message)
                                })
                            }
                        } else {
                            runOnMainThread({
                                => onError("Image download has no response")
                            })
                        }
                        safeDestroyHttpRequest(request)
                }
            )
        } catch (e: BusinessException) {
            safeDestroyHttpRequest(request)
            let message = e.message
            runOnMainThread({
                => onError(message)
            })
        }
    } catch (e: BusinessException) {
        let message = e.message
        runOnMainThread({
            => onError(message)
        })
    }
}

/// POST /api/edit锛宮ultipart/form-data锛堝瓧娈典笌 PTP server.js 涓€鑷达級
func apiEditImage(
    accessCode: String,
    prompt: String,
    workflowTemplate: String,
    imageBytes: Array<Byte>,
    onSuccess: (ImageTaskResult) -> Unit,
    onError: (String) -> Unit
): Unit {
    if (imageBytes.size == 0) {
        runOnMainThread({ => onError("图片数据为空") })
        return
    }
    try {
        let request = createHttp()
        let headers = HashMap<String, String>()
        headers.add("Accept", "application/json")
        let partMeta = forgeInferEditMultipartMeta(imageBytes)
        let formImage = MultiFormData(
            "image",
            partMeta.mime,
            remoteFileName: partMeta.remoteFileName,
            data: HttpData.ArrayData(imageBytes)
        )
        let formPrompt = MultiFormData(
            "prompt",
            "text/plain",
            remoteFileName: "",
            data: HttpData.StringData(prompt)
        )
        let formCode = MultiFormData(
            "accessCode",
            "text/plain",
            remoteFileName: "",
            data: HttpData.StringData(accessCode)
        )
        let formTpl = MultiFormData(
            "workflowTemplate",
            "text/plain",
            remoteFileName: "",
            data: HttpData.StringData(workflowTemplate)
        )
        let multiParts: Array<MultiFormData> = [formCode, formPrompt, formTpl, formImage]
        let options = HttpRequestOptions(
            method: RequestMethod.Post,
            extraData: HttpData.StringData(""),
            expectDataType: HttpDataType.StringValue,
            usingCache: false,
            header: headers,
            readTimeout: 180000u32,
            connectTimeout: 20000u32,
            multiFormDataList: multiParts
        )
        try {
            request.request(
                apiUrl("/api/edit"),
                options,
                {
                    err, resp =>
                        if (let Some(e) <- err) {
                            let message = e.message
                            runOnMainThread({
                                => onError(message)
                            })
                            safeDestroyHttpRequest(request)
                            return
                        }

                        if (let Some(r) <- resp) {
                            let responseBody = httpDataToString(r.result)
                            if (r.responseCode >= 200u32 && r.responseCode < 300u32) {
                                if (apiJsonBool(responseBody, "success") ?? false) {
                                    let parsed = parseImageTaskResult(responseBody)
                                    runOnMainThread({
                                        => onSuccess(parsed)
                                    })
                                } else {
                                    let message = apiJsonString(responseBody, "error") ?? "编辑失败"
                                    runOnMainThread({
                                        => onError(message)
                                    })
                                }
                            } else {
                                let message = apiJsonString(responseBody, "error") ?? "HTTP ${r.responseCode}"
                                runOnMainThread({
                                    => onError(message)
                                })
                            }
                        } else {
                            runOnMainThread({
                                => onError("Server returned no response")
                            })
                        }
                        safeDestroyHttpRequest(request)
                }
            )
        } catch (e: BusinessException) {
            safeDestroyHttpRequest(request)
            let message = e.message
            runOnMainThread({
                => onError(message)
            })
        }
    } catch (e: BusinessException) {
        let message = e.message
        runOnMainThread({
            => onError(message)
        })
    }
}

func apiRequest(
    method: RequestMethod,
    path: String,
    body: String,
    onSuccess: (String) -> Unit,
    onError: (String) -> Unit
): Unit {
    try {
        let request = createHttp()
        let headers = HashMap<String, String>()
        headers.add("Content-Type", "application/json")
        headers.add("Accept", "application/json")

        let options = HttpRequestOptions(
            method: method,
            extraData: HttpData.StringData(body),
            expectDataType: HttpDataType.StringValue,
            usingCache: false,
            header: headers,
            readTimeout: 180000u32,
            connectTimeout: 15000u32
        )

        try {
            request.request(
                apiUrl(path),
                options,
                {
                    err, resp =>
                        if (let Some(e) <- err) {
                            let message = e.message
                            runOnMainThread({
                                => onError(message)
                            })
                            safeDestroyHttpRequest(request)
                            return
                        }

                        if (let Some(r) <- resp) {
                            let responseBody = httpDataToString(r.result)
                            if (r.responseCode >= 200u32 && r.responseCode < 300u32) {
                                runOnMainThread({
                                    => onSuccess(responseBody)
                                })
                            } else {
                                let message = apiJsonString(responseBody, "error") ?? "HTTP ${r.responseCode}"
                                runOnMainThread({
                                    => onError(message)
                                })
                            }
                        } else {
                            runOnMainThread({
                                => onError("Server returned no response")
                            })
                        }
                        safeDestroyHttpRequest(request)
                }
            )
        } catch (e: BusinessException) {
            safeDestroyHttpRequest(request)
            let message = e.message
            runOnMainThread({
                => onError(message)
            })
        }
    } catch (e: BusinessException) {
        let message = e.message
        runOnMainThread({
            => onError(message)
        })
    }
}

func safeDestroyHttpRequest(request: HttpRequest): Unit {
    try {
        request.destroy()
    } catch (_: BusinessException) {}
}

func httpDataToString(data: HttpData): String {
    match (data) {
        case HttpData.StringData(value) => value
        case HttpData.ArrayData(bytes) => String.fromUtf8(bytes)
        case _ => ""
    }
}

func apiUrl(path: String): String {
    if (path.isEmpty()) {
        return ""
    }
    if (path.startsWith("http://") || path.startsWith("https://")) {
        return path
    }
    if (path.startsWith("/")) {
        return "${API_BASE_URL}${path}"
    }
    return "${API_BASE_URL}/${path}"
}

func parseUserInfo(body: String): UserInfo {
    let user = UserInfo()
    user.userId = apiJsonString(body, "userId") ?? ""
    user.username = apiJsonString(body, "username") ?? "User"
    user.email = apiJsonString(body, "email") ?? ""
    user.plan = apiJsonString(body, "plan") ?? "free"
    user.planName = apiJsonString(body, "planName") ?? user.plan
    user.credits = apiJsonInt(body, "credits") ?? 0
    user.usedCredits = apiJsonInt(body, "usedCredits") ?? 0
    user.editCreditCost = apiJsonInt(body, "edit") ?? 2
    user.generateCreditCost = apiJsonInt(body, "generate") ?? 1
    return user
}

func parseImageTaskResult(body: String): ImageTaskResult {
    let result = ImageTaskResult()
    result.imageUrl = apiUrl(apiJsonString(body, "image") ?? "")
    result.thumbnailUrl = apiUrl(apiJsonString(body, "thumbnail") ?? "")
    result.prompt = apiJsonString(body, "prompt") ?? ""
    result.creditsUsed = apiJsonInt(body, "creditsUsed") ?? 0
    result.creditsRemaining = apiJsonInt(body, "creditsRemaining") ?? -1
    return result
}

func jsonEscape(value: String): String {
    value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")
}

func jsonUnescape(value: String): String {
    value.replace("\\n", "\n").replace("\\r", "\r").replace("\\\"", "\"").replace("\\\\", "\\")
}

func apiJsonString(body: String, key: String): ?String {
    if (let Some(start) <- apiJsonValueStart(body, key)) {
        if (start >= body.size || body[start] != b'\"') {
            return None<String>
        }

        var index = start + 1
        var escaped = false
        while (index < body.size) {
            let current = body[index]
            if (escaped) {
                escaped = false
            } else if (current == b'\\') {
                escaped = true
            } else if (current == b'\"') {
                return Some(jsonUnescape(body[(start + 1)..index]))
            }
            index += 1
        }
    }

    return None<String>
}

func apiJsonInt(body: String, key: String): ?Int64 {
    if (let Some(raw) <- apiJsonPrimitive(body, key)) {
        return Int64.tryParse(raw)
    }
    return None<Int64>
}

func apiJsonBool(body: String, key: String): ?Bool {
    if (let Some(raw) <- apiJsonPrimitive(body, key)) {
        if (raw.startsWith("true")) {
            return Some(true)
        }
        if (raw.startsWith("false")) {
            return Some(false)
        }
    }
    return None<Bool>
}

func apiJsonObject(body: String, key: String): ?String {
    if (let Some(start) <- apiJsonValueStart(body, key)) {
        if (start >= body.size || body[start] != b'{') {
            return None<String>
        }

        var index = start
        var depth: Int64 = 0
        var inString = false
        var escaped = false
        while (index < body.size) {
            let current = body[index]
            if (inString) {
                if (escaped) {
                    escaped = false
                } else if (current == b'\\') {
                    escaped = true
                } else if (current == b'\"') {
                    inString = false
                }
            } else if (current == b'\"') {
                inString = true
            } else if (current == b'{') {
                depth += 1
            } else if (current == b'}') {
                depth -= 1
                if (depth == 0) {
                    return Some(body[start..(index + 1)])
                }
            }
            index += 1
        }
    }
    return None<String>
}

func apiJsonPrimitive(body: String, key: String): ?String {
    if (let Some(start) <- apiJsonValueStart(body, key)) {
        var end = start
        while (end < body.size && !isJsonValueTerminator(body[end])) {
            end += 1
        }
        if (end > start) {
            return Some(body[start..end].trimAscii())
        }
    }
    return None<String>
}

func apiJsonValueStart(body: String, key: String): ?Int64 {
    let token = "\"${key}\""
    if (let Some(keyIndex) <- body.indexOf(token)) {
        if (let Some(colonIndex) <- body.indexOf(":", keyIndex + token.size)) {
            var start = colonIndex + 1
            while (start < body.size && isJsonSpace(body[start])) {
                start += 1
            }
            return Some(start)
        }
    }
    return None<Int64>
}

func isJsonSpace(value: Byte): Bool {
    value == b' ' || value == b'\n' || value == b'\r' || value == b'\t'
}

func isJsonValueTerminator(value: Byte): Bool {
    value == b',' || value == b'}' || value == b']'
}
