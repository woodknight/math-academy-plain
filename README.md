# Little Sums

PC 端数学练习游戏，含圆点与数字显示、随机冒险和本地神经语音。

需要 Node.js 20.19 或更新版本。在项目目录运行：

```sh
npm ci
npm run setup:voice
npm run dev
```

打开 http://127.0.0.1:5173。首次安装会下载约 310 MB 的语音模型；安装脚本会核对固定版本和 SHA-256。之后启动、合成及播放朗读都不需要连接语音服务，也不需要 API Key。

语音使用 [Kokoro](https://github.com/hexgrad/kokoro/tree/main/kokoro.js)，在服务端 CPU 上运行完整精度模型。默认是 Heart 美式英语女声（`af_heart`），语速为 `0.9`。浏览器只播放服务端生成的 WAV，不调用浏览器或系统的 TTS。前端会预取当前题目和答案；服务端保留最多 384 个音频文件，重复朗读无需重新合成。

如需更换声音或语速，重启服务时设置：

```sh
TTS_VOICE=af_bella TTS_SPEED=0.95 npm run dev
```

模型存放在 `.models/kokoro/`，音频缓存在 `.cache/speech/`，这些文件和 `node_modules/` 都不进入 Git。复制项目到另一台 PC 后重新运行上述安装命令即可；也可以一起复制模型目录，以免再次下载。

Dots 模式答对后会翻转为数字算式，朗读完再等待 2 秒，然后恢复圆点题目。静音会停止朗读与音效。朗读失败时会显示重试提示，游戏仍能继续。

运行 `npm test` 检查数学规则、冒险造型、音频格式、语音缓存和播放取消。语音运行时和模型为 Apache-2.0，模型的来源及固定版本记录在 `voice-config.js`。
