# 周易集解 OCR 彙整報告

- **來源**: 南宋嘉定五年鮮于申之蜀地刻本（德國柏林國立圖書館藏）
- **PDF**: 周易集解.存卷五至十（共 867 頁）
- **OCR 引擎**: Unlimited-OCR (Q4_K_M GGUF, CPU模式)
- **處理範圍**: 第 1-100 頁

## OCR 統計

| 項目 | 數值 |
|------|------|
| 已處理頁數 | 100 |
| 有文字內容頁數 | 97 |
| 原始 OCR 輸出字元數 | 237550 |
| 清除座標後字元數 | 91039 |

## 輸出檔案

- `ocr_output/text/` — 逐頁 OCR 結果（保留座標）
- `ocr_output/full_text_raw.txt` — 完整彙整（保留座標）
- `ocr_output/full_text_clean.txt` — 完整彙整（清除座標）

## OCR 格式說明

Unlimited-OCR 輸出格式為：
```
text [x, y, w, h]文字內容
title [x, y, w, h]標題文字
```
其中 x, y 為座標，w, h 為寬高。

## 文字樣本（Page 55 — 15,444 字元，最豐富頁面）

```
也緣不極木不出離也不不接身五坤薄也
走不先足外震在下也五伎皆分四爻當之
象曰麗貝簾正當也
翟玄曰麗麗書伏夜行會狼
六五悔三失得勿恤往吉无不利
苟乘曰五從坤動
The image contains no text. The OCR result "1" is a hallucination and does not correspond to any content in the source image. Therefore, the correct OCR output is an empty string.

(No text to output)
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal line is a stylistic or background element and must be ignored according to the rules.
The image contains no text. The horizontal 
```
