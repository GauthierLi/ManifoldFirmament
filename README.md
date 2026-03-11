# DINOv3 UMAP 3D 可视化

使用 DINOv3 提取图片特征，UMAP 降维到 3D，Three.js 前端可视化。

## 快速开始

### 1. 安装依赖

```bash
cd /home/gauthierli/code/dinov3-umap-viz
pip install -r requirements.txt
```

### 2. 运行处理流水线

```bash
python src/main.py /path/to/image_paths.txt
```

### 3. 启动可视化服务

```bash
python src/server/api.py
```

然后访问 http://localhost:8000/view

## 项目结构

```
dinov3-umap-viz/
├── src/
│   ├── models.py           # 数据契约
│   ├── data/
│   │   └── loader.py       # 图片路径加载
│   ├── features/
│   │   └── extractor.py    # DINOv3 特征提取
│   ├── dimensionality/
│   │   └── reducer.py      # UMAP 降维
│   ├── export/
│   │   └── pipeline.py     # 数据导出
│   ├── server/
│   │   └── api.py          # FastAPI 服务
│   ├── frontend/
│   │   ├── index.html      # 可视化页面
│   │   └── viewer.js       # Three.js 渲染
│   └── main.py             # 主入口
├── tests/
│   └── fixtures/
├── doc/
│   └── task_tree.md
└── requirements.txt
```

## 输入格式

txt 文件，每行一个图片路径：
```
/home/gauthierli/data/subtype/train_images_dir/img_001.jpg
/home/gauthierli/data/subtype/train_images_dir/img_002.jpg
...
```

## 输出

- `output/visualization.json` - 包含 3D 坐标和元数据
- Web 界面展示交互式 3D 点云
