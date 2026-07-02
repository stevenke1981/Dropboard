# Baidu Unlimited-OCR 研究分析報告

**分析日期**: 2026-07-02
**分析來源**: HuggingFace Model Card、arXiv:2606.23050、GitHub、第三方評測與社群討論

---

## 1. 執行摘要

Baidu 於 2026 年 6 月 22 日開源了 **Unlimited-OCR**，這是一個 3B 參數的 Mixture-of-Experts (MoE) 視覺語言模型，專為**一次性長篇幅文件解析**（One-shot Long-horizon Parsing）設計。其核心創新是 **Reference Sliding Window Attention (R-SWA)**，能在解碼過程中維持**恆定的 KV Cache**，從根本上解決了傳統 LLM-based OCR 模型在處理長文件時記憶體線性增長的問題。

在 OmniDocBench v1.5 上達到 **93.23%** 的整體分數，v1.6 達到 **93.92%**，超越 DeepSeek-OCR 基線約 6 個百分點，成為當時的端到端 SOTA。

| 面向 | 摘要 |
|------|------|
| **機構** | Baidu Inc. |
| **發佈日期** | 2026-06-22 |
| **授權** | MIT（完全開源） |
| **參數量** | 3B 總參數 / 500M 激活參數 |
| **上下文窗口** | 32,768 tokens |
| **模型大小** | ~6.78 GB (BF16) |
| **GitHub Stars** | 7,200+ |
| **HF 月下載量** | 630,000+ |

---

## 2. 基本資訊

### 2.1 模型定位

Unlimited-OCR 是一個**端到端光學字元辨識（OCR）模型**，可將圖片/PDF 直接轉換為結構化文字輸出（Markdown/HTML）。與傳統 OCR 管線（版面分析 → 文字偵測 → 文字辨識）不同，它使用單一視覺語言模型一步完成。

### 2.2 資料卡片

| 欄位 | 內容 |
|------|------|
| HuggingFace | [baidu/Unlimited-OCR](https://huggingface.co/baidu/Unlimited-OCR) |
| GitHub | [baidu/Unlimited-OCR](https://github.com/baidu/Unlimited-OCR) |
| Paper | [arXiv:2606.23050](https://arxiv.org/abs/2606.23050) |
| Demo | [HF Spaces](https://huggingface.co/spaces/baidu/Unlimited-OCR) |
| ModelScope | [PaddlePaddle/Unlimited-OCR](https://modelscope.cn/models/PaddlePaddle/Unlimited-OCR) |
| Pipeline Tag | `image-text-to-text` |
| Framework | Transformers, vLLM, SGLang |

### 2.3 作者團隊

由百度 17 位研究人員（Youyang Yin、Huanhuan Liu 等）發表，論文以 technical report 形式公開。

---

## 3. 核心技術創新

### 3.1 問題背景

傳統 LLM-based OCR（如 DeepSeek-OCR）使用標準因果注意力（Causal Attention），產生每個 token 時 KV cache 會線性累積：

```
問題：KV Cache 大小 ∝ 輸出長度
→ 長文件時：記憶體暴增 + 生成速度大幅下降
→ 常見解法：分頁處理後拼接（Split-and-Stitch）
→ 但拼接會破壞跨頁表格、閱讀順序與上下文連貫性
```

### 3.2 R-SWA（Reference Sliding Window Attention）

這是 Unlimited-OCR 的核心創新，模擬人類抄寫長文件時的工作記憶模式：

**注意力範圍分為兩個固定集合：**

1. **Reference Tokens（參考 tokens）**：所有視覺 tokens + 提示詞（prompt），**始終可完整關注**
2. **Output Sliding Window（輸出滑動窗口）**：最近生成的 **n 個 tokens**（預設 n=128），舊的輸出 tokens 會「軟遺忘」

**數學表達**：
```
對於每個生成位置 t：
Attn(t) = softmax(Q_t · [K_ref; K_window]^T / √d)
其中 K_ref 固定不變，K_window 僅包含最近 n 個位置的 KV
```

**關鍵效果**：
- KV cache 大小 = |reference tokens| + n，**完全與輸出長度無關**
- 視覺訊息始終可用（無資訊丟失）
- 歷史 OCR 進度透過因果滑動窗口內的狀態轉移隱式追蹤
- 預設窗口大小 128，適用於多數文件；多頁模式使用 1024

### 3.3 整體架構

```
Unlimited-OCR = DeepSeek-OCR 架構 + R-SWA 注意力取代
```

| 元件 | 說明 |
|------|------|
| **視覺編碼器 (DeepEncoder)** | SAM-ViT + CLIP-ViT 級聯，16 倍 token 壓縮 |
| | 一張 1024×1024 頁面 → 僅 **256 個視覺 tokens** |
| **文字解碼器** | DeepSeek-V2 MoE，3B 總參數 / 500M 激活 |
| | **所有注意力層替換為 R-SWA** |
| **推理模式** | `gundam`（單頁裁剪）或 `base`（完整解析度） |

### 3.4 Continue-Training 策略

- 基於 **DeepSeek-OCR** 進行 continue-training
- 僅使用 **200 萬頁 PDF 文檔數據**（2M PDF-document-specific data）
- 非從零訓練，大幅降低訓練成本

---

## 4. Benchmark 表現

### 4.1 OmniDocBench v1.5 主要結果

| 模型 | 整體 | 文字編輯距離↓ | 表格 TEDS↑ | 公式 CDM↑ |
|------|------|-------------|-----------|-----------|
| **Unlimited-OCR (3B-A0.5B)** | **93.23** | **0.038** | **90.93** | **92.61** |
| DeepSeek-OCR (基線) | 87.01 | 0.073 | 84.97 | 83.37 |
| **提升幅度** | **+6.22** | **-0.035** | **+5.96%** | **+9.24%** |

*資料來源：arXiv:2606.23050 Table 1*

### 4.2 OmniDocBench v1.6 結果

| 模型 | 整體 | 文字編輯距離↓ | 表格 TEDS↑ | 公式 CDM↑ |
|------|------|-------------|-----------|-----------|
| **Unlimited-OCR (3B-A0.5B)** | **93.92** | 0.042 | 90.16 | 95.79 |
| PaddleOCR-VL-1.6 | 96.33 | - | - | - |
| MinerU2.5-Pro | 95.69 | - | - | - |

*資料來源：CodeSOTA registry、arXiv:2606.23050*

> **注意**：v1.6 上 PaddleOCR-VL-1.6 和 MinerU2.5-Pro 分數更高，但這些是不同時間點和不同測試設定下的結果，需謹慎比較。

### 4.3 長文件專項測試（自建測試集）

| 頁數 | 編輯距離 | Distinct-35 |
|------|---------|-------------|
| 20 頁（單次推理） | 0.0572 | 99.89% |
| 40+ 頁（單次推理） | 0.1069 | 96.90% |

*資料來源：Pandaily 引用論文數據*

即使在 40 頁以上，仍保持可用的辨識品質，這在端到端 OCR 模型中極為罕見。

### 4.4 推理速度

| 模型 | TPS (tokens/s, 512 concurrency) |
|------|----------------------------------|
| **Unlimited-OCR** | **5,580** |
| DeepSeek-OCR | 4,951 |
| **提升** | **+12.7%** |

在長文件場景中，由於 KV cache 恆定，Unlimited-OCR 的速度優勢會隨著輸出長度增加而更明顯。

### 4.5 ParseBench 評估結果

| 指標 | 分數 |
|------|------|
| Mean | 46.17 |
| Text Content | 86.81 |
| Text Formatting | 0.97 |

*資料來源：[HuggingFace 評估結果](https://huggingface.co/datasets/llamaindex/ParseBench)*

> **注意**：Text Formatting 分數極低（0.97），顯示模型在保留文字格式方面有顯著限制。

---

## 5. 生態系與工具支援

### 5.1 支援的推理框架

| 框架 | 狀態 | 說明 |
|------|------|------|
| 🤗 Transformers | ✅ 官方支援 | `trust_remote_code=True` 載入 |
| vLLM | ✅ 官方支援 | 支援 Docker 部署 |
| SGLang | ✅ 官方支援 | 支援 OpenAI-compatible API |
| Docker Model Runner | ✅ 支援 | `docker model run hf.co/baidu/Unlimited-OCR` |

### 5.2 量化模型生態

已有 **14 個量化版本**（llama.cpp、Ollama、LM Studio 等），以及 **7 個微調版本**。

### 5.3 社群 Spaces

18 個 HuggingFace Spaces 使用該模型，包括官方 demo、第三方測試 bench 等。

---

## 6. 優點分析

### 6.1 技術優勢

| 優勢 | 說明 |
|------|------|
| **恆定 KV Cache** | R-SWA 消除長文件記憶體瓶頸，輸出長度不影響記憶體使用 |
| **一次性處理** | 無需分頁拼接，跨頁表格與上下文保持完整 |
| **高壓縮率編碼** | 每頁僅 256 個視覺 tokens，1024×1024 頁面高效處理 |
| **MoE 高效架構** | 僅 500M 激活參數，推理成本極低 |
| **開源 MIT 授權** | 完全免費，商用友善，無 API 費用，資料不離開本地 |
| **多框架支援** | Transformers、vLLM、SGLang 皆可部署 |
| **結構化輸出** | 表格 → HTML、公式 → LaTeX、版面順序保留 |

### 6.2 實務優勢

- **資料隱私**：完全本地端運行，敏感文件不需上傳雲端
- **低硬體需求**：可在單張中階 NVIDIA GPU 上運行（3B 參數 BF16 約 6.78 GB VRAM）
- **快速上手**：HuggingFace pipeline 數行程式碼即可使用
- **成熟生態**：背靠 PaddleOCR 和 DeepSeek-OCR 生態系

---

## 7. 缺點與限制

### 7.1 技術限制

| 限制 | 詳細說明 |
|------|---------|
| **文字格式保留差** | ParseBench Text Formatting 僅 0.97（滿分 100），格式保留能力明顯不足 |
| **Prefill 階段仍受限** | R-SWA 僅在生成階段維持恆定 KV cache，初始 prefill 階段仍受物理記憶體限制 |
| **僅 32K 上下文** | 雖然能處理數十頁，但 max_length 僅 32K，極長文件（如上百頁）仍受限 |
| **軟遺忘風險** | R-SWA 對超過窗口的輸出 token 進行「軟遺忘」，如果模型無法從視覺 tokens 重建上下文，可能遺失跨頁語義 |
| **未公開訓練細節** | 論文為 technical report，缺乏完整的訓練設定、超參數、資料集細節 |
| **基於 DeepSeek-OCR 繼續訓練** | 非從零訓練，創新主要在注意力機制，模型架構層面的原創性有限 |
| **僅支援 BF16** | 官方測試僅在 BF16 精度下驗證，FP16/FP32 相容性未說明 |

### 7.2 實務限制

| 限制 | 詳細說明 |
|------|---------|
| **需要 NVIDIA GPU** | 官方僅支援 CUDA，尚無 MPS/CPU 官方支援（社群有相關 PR [#5](https://huggingface.co/baidu/Unlimited-OCR/discussions/5)）|
| **高版本依賴** | 需要 Python 3.12、CUDA 12.9、PyTorch 2.10、Transformers 4.57.1 |
| **社群回報品質問題** | [討論 #3](https://huggingface.co/baidu/Unlimited-OCR/discussions/3) 指出「官方 Space 的 OCR 效果不佳」，部分案例品質不穩定 |
| **多語言支援待驗證** | 模型標記為 multilingual，但社群有 Arabic language 支援的提問（討論 #8） |
| **無 ComfyUI 支援** | 社群有相關請求（討論 #7） |
| **無專用 API** | 百度未提供託管 API，需自行部署 |

### 7.3 與對手的比較劣勢

| 面向 | Unlimited-OCR | PaddleOCR-VL-1.6 | GLM-OCR |
|------|--------------|------------------|---------|
| 參數量 | 3B | 未公開 | 未公開 |
| OmniDocBench v1.6 | 93.92 | **96.33** | ~94.62 (v1.5) |
| 授權 | MIT | 未公開 | 未公開 |
| 生態成熟度 | 新興 | 百度自家生態 | Zhipu 生態 |

---

## 8. 研究貢獻評估

### 8.1 理論貢獻

1. **提出 R-SWA 注意力機制**：一種通用解析注意力機制，不僅限於 OCR，也可應用於 ASR、翻譯等序列生成任務。
2. **證明線性複雜度注意力在長篇幅 OCR 場景的有效性**：非暴力擴展訓練上下文，而是透過注意力設計優雅達成。
3. **建立長文件 OCR 的評估框架**：自建長文件測試集（20 頁、40+ 頁），提供編輯距離和 Distinct-N 指標。

### 8.2 實務貢獻

1. **降低長文件 OCR 的技術門檻**：使消費級 GPU 也能處理數十頁文件的完整解析。
2. **加速 Document AI 管線**：消除 Split-and-Stitch 的工程複雜度和誤差累積。
3. **推動 RAG 應用的文件處理環節**：提供更乾淨、上下文完整的文件輸入。

### 8.3 證據等級評估

| 面向 | 等級 | 說明 |
|------|------|------|
| OmniDocBench 結果 | **B**（同行評審會議論文基準） | CVPR 2025 接受的基準 |
| 長文件測試 | **D**（自建測試集） | 非公開、未經第三方驗證 |
| 推理速度數據 | **D**（作者自報） | 未經獨立第三方複現 |
| ParseBench 評估 | **C**（第三方評估） | 由 llamaindex 上傳 |

---

## 9. 矛盾與爭議

### 9.1 內部矛盾

| 矛盾 | 作者主張 | 其他證據 |
|------|---------|---------|
| SOTA 宣稱 | 論文稱達到 end-to-end SOTA | CodeSOTA 上 PaddleOCR-VL-1.6 (96.33) 和 MinerU2.5-Pro (95.69) 在 v1.6 分數更高 |
| 模型命名 | 「Unlimited」OCR | 實際上仍受 32K 上下文長度與硬體記憶體限制 |

### 9.2 社群反饋矛盾

- HuggingFace Space 上有使用者反映官方 demo 表現不佳（討論 #3），而作者宣稱 SOTA 效能，兩者存在落差
- 可能原因：demo 環境可能使用了較低的運算資源或未優化的推理設定

---

## 10. 研究缺口與未來方向

### 10.1 尚未回答的問題

1. **R-SWA 的窗口大小如何最優選擇？** 論文預設 128，多頁模式 1024，但缺乏窗口大小對不同任務影響的系統性研究。
2. **R-SWA 在非 OCR 任務的泛化能力？** 論文提到可應用於 ASR、翻譯，但無實驗證據。
3. **「軟遺忘」對跨頁依賴性強的任務影響？** 如法律合約中前後條款引用。
4. **不同語言/字體的辨識能力？** 尤其是非拉丁語系（阿拉伯文、CJK 等）。
5. **訓練資料構成與版權？** 2M PDF 數據的來源與版權狀態未說明。

### 10.2 未來研究方向

1. **R-SWA + 更長上下文**：結合更大的 base window 或動態窗口調整
2. **跨模態應用**：將 R-SWA 應用於語音辨識（ASR）、機器翻譯等
3. **R-SWA + RAG**：作為 RAG 系統的 document parser，評估對 downstream QA 的影響
4. **更高效的視覺編碼**：進一步壓縮視覺 tokens，降低 prefill 成本
5. **蒸餾與量化**：將 R-SWA 模型蒸餾到更小的架構

---

## 11. 綜合評估

### 11.1 研究品質評分（依 Peer Review 標準）

| 類別 | 分數 (1-10) | 說明 |
|------|------------|------|
| 新穎性 | **7** | R-SWA 概念簡潔有效，但基於 DeepSeek-OCR 繼續訓練 |
| 技術扎實度 | **8** | 理論清晰，實驗設計合理，但缺少消融研究 |
| 實驗設計 | **7** | OmniDocBench 標準評估完整，長文件測試說服力稍弱 |
| 清晰度 | **8** | 論文寫作清晰，動機明確 |
| 影響力 | **9** | 開源 MIT、低門檻、潛在廣泛應用 |
| **綜合** | **7.8** | 具有實務影響力的紮實技術報告 |

### 11.2 審稿決策模擬

| Reviewer | 建議 | 關鍵考量 |
|----------|------|---------|
| Reviewer 1 | **弱接受** | 技術正確，實驗可複現，但貢獻增量有限 |
| Reviewer 2 | **邊緣** | 新穎性一般，缺乏跨任務驗證，長文件測試集非公開 |
| Area Chair | **弱接受** | 實務貢獻顯著，開源生態影響力大 |

### 11.3 最終結論

> Unlimited-OCR 是一項**具有高度實務影響力的工程創新**，其 R-SWA 機制優雅地解決了長文件 OCR 的 KV cache 問題。雖然在學術新穎性上屬於增量貢獻（基於 DeepSeek-OCR continue-training），但其 MIT 授權、低硬體需求、開源生態支援，使其有潛力成為 Document AI 領域的基礎設施級工具。

---

## 12. 參考文獻

1. Yin, Y., Liu, H., et al. (2026). *Unlimited OCR Works*. arXiv:2606.23050.
2. DeepSeek-AI. (2025). *DeepSeek-OCR*. GitHub: https://github.com/deepseek-ai/DeepSeek-OCR
3. Ouyang, et al. (2025). *OmniDocBench: A Comprehensive Benchmark for Document Parsing*. CVPR 2025.
4. Baidu. (2026). *PaddleOCR-VL-1.6*. arXiv:2606.03264.
5. MinerU. (2026). *MinerU2.5-Pro*. arXiv:2604.04771.
6. GLM-OCR Team. (2026). *GLM-OCR Technical Report*. arXiv:2603.10910.
7. llama-index. (2026). *ParseBench Evaluation*. https://huggingface.co/datasets/llamaindex/ParseBench

---

*本報告基於公開資訊分析，所有觀點均標註了事實、解讀、推測與缺失證據。完成日期：2026-07-02。*
