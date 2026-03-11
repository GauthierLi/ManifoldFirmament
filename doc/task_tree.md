# 任务树 - DINOv3 + UMAP 3D 可视化

**项目目标**：读取图片路径列表，使用 DINOv3 提取特征，UMAP 降维到 3D，前端可视化

**根节点**：`[root]` DINOv3-UMAP 可视化系统

---

## 任务树结构

```
[root] DINOv3-UMAP 可视化系统
├── [1] 数据加载模块
│   └── [1.1] ImagePathLoader ❓ → 🔨 → ✅
├── [2] 特征提取模块
│   └── [2.1] DINOv3FeatureExtractor ❓ → 🔨 → ✅
├── [3] 降维模块
│   └── [3.1] UMAPReducer ❓ → 🔨 → ✅
├── [4] 数据导出模块
│   └── [4.1] ExportPipeline ❓ → 🔨 → ✅
└── [5] 前端可视化模块
    ├── [5.1] FastAPIServer ❓ → 🔨 → ✅
    └── [5.2] ThreeJSViewer ❓ → 🔨 → ✅
```

---

## 节点详情

### [root] DINOv3-UMAP 可视化系统
- **职责**：协调整个流程，从输入到可视化端到端运行
- **文件**：`src/main.py`
- **输入**：txt 文件路径（图片路径列表）
- **输出**：浏览器中显示的 3D 点云可视化

### [1] 数据加载模块
#### [1.1] ImagePathLoader
- **职责**：读取 txt 文件，解析图片路径，验证文件存在性
- **文件**：`src/data/loader.py`
- **输入**：txt 文件路径
- **输出**：图片路径列表 `List[str]`

### [2] 特征提取模块
#### [2.1] DINOv3FeatureExtractor
- **职责**：加载 DINOv3 预训练模型，批量提取图片特征
- **文件**：`src/features/extractor.py`
- **输入**：图片路径列表
- **输出**：特征矩阵 `np.ndarray (N, D)`，D 为 DINOv3 输出维度

### [3] 降维模块
#### [3.1] UMAPReducer
- **职责**：使用 UMAP 将高维特征降维到 3D
- **文件**：`src/dimensionality/reducer.py`
- **输入**：特征矩阵 `(N, D)`
- **输出**：3D 坐标 `(N, 3)`

### [4] 数据导出模块
#### [4.1] ExportPipeline
- **职责**：将 3D 坐标 + 元数据导出为 JSON，供前端使用
- **文件**：`src/export/pipeline.py`
- **输入**：3D 坐标、图片路径
- **输出**：JSON 文件（包含点坐标、颜色、图片路径等）

### [5] 前端可视化模块
#### [5.1] FastAPIServer
- **职责**：提供 API 服务，返回可视化数据
- **文件**：`src/server/api.py`
- **输入**：处理后的 JSON 数据
- **输出**：HTTP API 端点

#### [5.2] ThreeJSViewer
- **职责**：3D 点云渲染，支持旋转、缩放、点击
- **文件**：`src/frontend/index.html`, `src/frontend/viewer.js`
- **输入**：从 API 获取的点数据
- **输出**：浏览器中的交互式 3D 可视化

---

## 实现进度

| 节点 | 状态 | 说明 |
|------|------|------|
| [root] | ✅ | 已完成 |
| [1.1] | ✅ | 已完成 |
| [2.1] | ✅ | 已完成 |
| [3.1] | ✅ | 已完成 |
| [4.1] | ✅ | 已完成 |
| [5.1] | ✅ | 已完成 |
| [5.2] | ✅ | 已完成 |

**完成时间**: 2026-03-11 19:15

---

## 技术栈

- **Python**: 3.9+
- **深度学习**: PyTorch, DINOv3 (facebookresearch/dinov3)
- **降维**: umap-learn
- **后端**: FastAPI
- **前端**: Three.js
- **数据处理**: numpy, PIL/Pillow

---

*最后更新：2026-03-11 19:05*
