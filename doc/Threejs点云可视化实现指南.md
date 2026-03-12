# Three.js 点云可视化实现指南

**创建时间**: 2026-03-12  
**适用范围**: 任意点云数据的 3D 可视化前端实现  
**技术栈**: Three.js + 原生 JavaScript

---

## 📋 效果展示

**目标效果**:
- 🎯 固定大小的点（缩放时点大小不变）
- 🖱️ 鼠标悬停显示点的信息
- 🔄 支持旋转、缩放、平移
- 📐 自动适应点云边界，相机自动定位

---

## 🚀 快速开始

### 1. HTML 结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D 点云可视化</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { overflow: hidden; background: #0a0a0f; color: #fff; }
        #canvas-container { width: 100vw; height: 100vh; }
        
        /* Tooltip 样式 */
        #tooltip {
            position: absolute;
            background: rgba(0, 0, 0, 0.95);
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 13px;
            pointer-events: none;
            display: none;
            max-width: 400px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            z-index: 1000;
        }
    </style>
</head>
<body>
    <div id="canvas-container"></div>
    <div id="tooltip"></div>
    
    <!-- 引入 Three.js -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="viewer.js"></script>
</body>
</html>
```

---

## 💻 核心代码 (viewer.js)

### 2. 初始化场景

```javascript
class PointCloudViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.pointData = null;  // 存储原始点数据
        
        // 射线检测
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.init();
    }
    
    init() {
        // 1. 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        
        // 2. 创建相机
        this.camera = new THREE.PerspectiveCamera(
            75,  // 视野角度
            window.innerWidth / window.innerHeight,  // 宽高比
            0.1,  // 近裁剪面
            1000  // 远裁剪面
        );
        
        // 3. 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        // 4. 添加轨道控制器
        this.controls = new THREE.OrbitControls(
            this.camera, 
            this.renderer.domElement
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 2.0;
        
        // 5. 窗口大小调整
        window.addEventListener('resize', () => this.onResize());
        
        // 6. 鼠标移动事件（悬停检测）
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            this.onMouseMove(e);
        });
        
        // 7. 开始渲染循环
        this.animate();
    }
}
```

---

### 3. 渲染点云（⭐ 核心）

```javascript
/**
 * 渲染点云
 * @param {Array} points - 点数据数组，每个点包含 {x, y, z, color: [r,g,b], ...}
 */
renderPointCloud(points) {
    const geometry = new THREE.BufferGeometry();
    
    // 1. 准备位置数组和颜色数组
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    
    // 2. 计算边界（用于相机定位）
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    // 3. 填充数据
    points.forEach((p, i) => {
        // 位置
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        
        // 颜色
        colors[i * 3] = p.color[0];
        colors[i * 3 + 1] = p.color[1];
        colors[i * 3 + 2] = p.color[2];
        
        // 更新边界
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    });
    
    // 4. 设置几何体属性
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    // 5. ⭐ 关键：创建材质（固定大小的点）
    const material = new THREE.PointsMaterial({
        size: 2,                    // 点大小（像素）
        vertexColors: true,         // 使用顶点颜色
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: false      // ⭐ 禁用距离缩放，点大小固定
    });
    
    // 6. 创建点云对象
    this.points = new THREE.Points(geometry, material);
    this.points.userData = { pointsData: points };  // 存储原始数据供悬停使用
    this.scene.add(this.points);
    
    // 7. ⭐ 自动调整相机位置
    this.fitCameraToPointCloud(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (minZ + maxZ) / 2,
        Math.max(maxX - minX, maxY - minY, maxZ - minZ)
    );
}

/**
 * 自动调整相机位置以适应点云
 */
fitCameraToPointCloud(centerX, centerY, centerZ, maxDim) {
    // 相机放在点云前方 1.5 倍最大尺寸的位置
    this.camera.position.set(
        centerX,
        centerY,
        centerZ + maxDim * 1.5
    );
    
    // 控制器看向点云中心
    this.controls.target.set(centerX, centerY, centerZ);
    this.controls.update();
}
```

---

### 4. 鼠标悬停检测

```javascript
/**
 * 鼠标移动事件处理
 */
onMouseMove(event) {
    // 1. 计算鼠标位置（归一化设备坐标 -1 到 1）
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // 2. 更新射线
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // 3. 检测射线与点云的交点
    if (this.points) {
        const intersects = this.raycaster.intersectObject(this.points);
        const tooltip = document.getElementById('tooltip');
        
        if (intersects.length > 0) {
            // 4. 获取交点对应的点数据
            const index = intersects[0].index;
            const pointData = this.points.userData.pointsData[index];
            
            // 5. 显示 tooltip
            tooltip.style.display = 'block';
            tooltip.style.left = (event.clientX + 15) + 'px';
            tooltip.style.top = (event.clientY + 15) + 'px';
            tooltip.innerHTML = `
                <div style="color: #60a5fa; word-break: break-all;">
                    ${pointData.image_path || '点 ' + index}
                </div>
                <div style="color: #9ca3af; font-size: 12px; margin-top: 4px;">
                    索引：${pointData.original_index || index}
                </div>
            `;
            
            // 6. 改变鼠标样式
            document.body.style.cursor = 'pointer';
        } else {
            // 没有交点，隐藏 tooltip
            tooltip.style.display = 'none';
            document.body.style.cursor = 'default';
        }
    }
}
```

---

### 5. 渲染循环和窗口调整

```javascript
/**
 * 渲染循环
 */
animate() {
    requestAnimationFrame(() => this.animate());
    
    // 更新控制器（必须调用，enableDamping 才生效）
    if (this.controls) {
        this.controls.update();
    }
    
    // 渲染场景
    this.renderer.render(this.scene, this.camera);
}

/**
 * 窗口大小调整
 */
onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
}
```

---

### 6. 使用示例

```javascript
// 1. 创建查看器
const viewer = new PointCloudViewer('canvas-container');

// 2. 加载点云数据（从 API 或本地）
fetch('/api/data')
    .then(res => res.json())
    .then(data => {
        viewer.renderPointCloud(data.points);
    });

// 3. 或者直接使用本地数据
const localData = {
    points: [
        { x: 0, y: 0, z: 0, color: [1, 0, 0] },
        { x: 1, y: 0, z: 0, color: [0, 1, 0] },
        { x: 0, y: 1, z: 0, color: [0, 0, 1] },
        // ... 更多点
    ]
};
viewer.renderPointCloud(localData.points);
```

---

## ⚙️ 关键配置参数

### 点材质配置

```javascript
const material = new THREE.PointsMaterial({
    size: 2,                    // ⭐ 点大小（像素）
                                // 推荐值：1-3
    
    vertexColors: true,         // ⭐ 是否使用顶点颜色
                                // true = 每个点独立颜色
                                // false = 统一颜色
    
    transparent: true,          // 是否透明
    opacity: 0.9,               // 透明度 (0-1)
    
    sizeAttenuation: false      // ⭐⭐⭐ 关键参数
                                // false = 点大小固定（推荐）
                                // true = 点随距离缩放
});
```

### 相机配置

```javascript
this.camera = new THREE.PerspectiveCamera(
    75,     // FOV 视野角度，推荐 60-80
    aspect, // 宽高比
    0.1,    // 近裁剪面
    1000    // 远裁剪面
);
```

### 控制器配置

```javascript
this.controls = new THREE.OrbitControls(camera, renderer.domElement);
this.controls.enableDamping = true;      // 启用阻尼（惯性）
this.controls.dampingFactor = 0.05;      // 阻尼系数
this.controls.autoRotate = true;         // 自动旋转
this.controls.autoRotateSpeed = 2.0;     // 旋转速度
```

---

## 🎨 进阶效果

### 1. 根据坐标生成颜色

```javascript
// 让空间位置相近的点颜色相近
function generateColorFromCoords(x, y, z, bounds) {
    const r = (x - bounds.minX) / (bounds.maxX - bounds.minX);
    const g = (y - bounds.minY) / (bounds.maxY - bounds.minY);
    const b = (z - bounds.minZ) / (bounds.maxZ - bounds.minZ);
    return [r, g, b];
}
```

### 2. 添加中心点标记

```javascript
// 在点云中心添加一个小球作为参考
const centerGeometry = new THREE.SphereGeometry(0.5, 16, 16);
const centerMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffff,
    transparent: true,
    opacity: 0.5
});
const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);
centerSphere.position.set(centerX, centerY, centerZ);
this.scene.add(centerSphere);
```

### 3. 添加坐标轴

```javascript
// 添加 XYZ 坐标轴
const axesHelper = new THREE.AxesHelper(5);
this.scene.add(axesHelper);
```

### 4. 点击事件

```javascript
this.renderer.domElement.addEventListener('click', (event) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const intersects = this.raycaster.intersectObject(this.points);
    if (intersects.length > 0) {
        const index = intersects[0].index;
        console.log('点击了点:', index);
        // 执行点击逻辑
    }
});
```

---

## 🐛 常见问题

### 1. 点太大/太小

**解决**: 调整 `size` 参数
```javascript
size: 2  // 改成 1 或 3
```

### 2. 点随距离缩放

**解决**: 设置 `sizeAttenuation: false`

### 3. 看不到点

**检查**:
- 相机位置是否正确（调用 `fitCameraToPointCloud`）
- 点的坐标是否在相机视野内
- 点的颜色是否和背景太接近

### 4. 悬停检测不准确

**解决**: 确保点云对象存储了原始数据：
```javascript
this.points.userData = { pointsData: points };
```

### 5. 性能问题（点数太多）

**优化**:
- 使用 `BufferGeometry`（已默认使用）
- 减少 `opacity` 计算（设置 `transparent: false` 如果不需要透明）
- 降低 `pixelRatio`：`renderer.setPixelRatio(0.5)`

---

## 📦 完整代码模板

复制下方代码即可直接使用：

```javascript
// viewer.js
class PointCloudViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.init();
    }
    
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        
        this.camera = new THREE.PerspectiveCamera(
            75, window.innerWidth / window.innerHeight, 0.1, 1000
        );
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);
        
        this.controls = new THREE.OrbitControls(
            this.camera, this.renderer.domElement
        );
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        
        window.addEventListener('resize', () => this.onResize());
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        this.animate();
    }
    
    renderPointCloud(points) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        points.forEach((p, i) => {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            colors[i * 3] = p.color[0];
            colors[i * 3 + 1] = p.color[1];
            colors[i * 3 + 2] = p.color[2];
            
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: false
        });
        
        this.points = new THREE.Points(geometry, material);
        this.points.userData = { pointsData: points };
        this.scene.add(this.points);
        
        this.fitCameraToPointCloud(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2,
            Math.max(maxX - minX, maxY - minY, maxZ - minZ)
        );
    }
    
    fitCameraToPointCloud(cx, cy, cz, maxDim) {
        this.camera.position.set(cx, cy, cz + maxDim * 1.5);
        this.controls.target.set(cx, cy, cz);
        this.controls.update();
    }
    
    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        if (this.points) {
            const intersects = this.raycaster.intersectObject(this.points);
            const tooltip = document.getElementById('tooltip');
            
            if (intersects.length > 0) {
                const index = intersects[0].index;
                const p = this.points.userData.pointsData[index];
                
                tooltip.style.display = 'block';
                tooltip.style.left = (event.clientX + 15) + 'px';
                tooltip.style.top = (event.clientY + 15) + 'px';
                tooltip.innerHTML = `
                    <div style="color:#60a5fa">${p.label || '点 ' + index}</div>
                    <div style="color:#9ca3af;font-size:12px">索引：${p.index || index}</div>
                `;
                document.body.style.cursor = 'pointer';
            } else {
                tooltip.style.display = 'none';
                document.body.style.cursor = 'default';
            }
        }
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// 使用
const viewer = new PointCloudViewer('canvas-container');
// viewer.renderPointCloud(yourPoints);
```

---

## ✅ 复用清单

给其他模型复现时，确保以下要点：

- [ ] **使用 `THREE.Points`** 渲染点云（不是 `InstancedMesh`）
- [ ] **`sizeAttenuation: false`** 固定点大小
- [ ] **`vertexColors: true`** 支持每点独立颜色
- [ ] **`BufferGeometry`** 高性能几何体
- [ ] **存储原始数据** `points.userData = { pointsData: points }`
- [ ] **射线检测** 鼠标悬停显示信息
- [ ] **OrbitControls** 旋转/缩放/平移
- [ ] **自动相机定位** 根据点云边界调整相机
- [ ] **窗口自适应** resize 事件处理
- [ ] **渲染循环** requestAnimationFrame

---

*文档版本：1.0*  
*最后更新：2026-03-12*
