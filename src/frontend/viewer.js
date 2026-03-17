/**
 * Three.js 3D 点云查看器
 * 
 * 功能：
 * - 加载可视化数据并渲染 3D 点云
 * - 支持旋转、缩放、平移
 * - 点击选点显示邻居图片卡片
 * - 自动旋转、截图等功能
 */

// ============================================================
// OneEuroFilter — 1€ 低通滤波器（标量）
//   参考: Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter
//         for Noisy Input in Interactive Systems", CHI 2012
// ============================================================
class LowPassFilter {
    constructor(alpha, initval = 0) {
        this._y = this._s = initval;
        this._alpha = alpha;
    }
    setAlpha(a) { this._alpha = a; }
    filter(value) {
        this._y = value;
        this._s = this._alpha * value + (1 - this._alpha) * this._s;
        return this._s;
    }
    lastValue() { return this._s; }
}

class OneEuroFilter {
    /**
     * @param {number} freq      采样频率 (Hz)
     * @param {number} minCutoff 最小截止频率（越小越平滑，推荐 0.5-1.0）
     * @param {number} beta      速度系数（越大对快速运动跟随越快，推荐 0.0-1.0）
     * @param {number} dCutoff   导数截止频率（推荐 1.0）
     */
    constructor(freq = 60, minCutoff = 0.8, beta = 0.5, dCutoff = 1.0) {
        this._freq = freq;
        this._minCutoff = minCutoff;
        this._beta = beta;
        this._dCutoff = dCutoff;
        this._x = null;
        this._dx = null;
        this._lastTime = null;
    }

    _alpha(cutoff) {
        const te = 1.0 / this._freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }

    reset() {
        this._x = null;
        this._dx = null;
        this._lastTime = null;
    }

    filter(value, timestamp = null) {
        if (this._x === null) {
            this._x = new LowPassFilter(this._alpha(this._minCutoff), value);
            this._dx = new LowPassFilter(this._alpha(this._dCutoff), 0);
            this._lastTime = timestamp;
            return value;
        }

        if (timestamp !== null && this._lastTime !== null) {
            const dt = timestamp - this._lastTime;
            if (dt > 0) this._freq = 1.0 / dt;
            this._lastTime = timestamp;
        }

        const prevX = this._x.lastValue();
        const dx = (value - prevX) * this._freq;
        const edx = this._dx.filter(dx);
        const cutoff = this._minCutoff + this._beta * Math.abs(edx);

        this._x._alpha = this._alpha(cutoff);
        return this._x.filter(value);
    }
    }

    /**
 * 3 分量 1€ 向量滤波器，用于 THREE.Vector3
 */
class OneEuroVector3Filter {
    constructor(freq = 60, minCutoff = 0.8, beta = 0.5, dCutoff = 1.0) {
        this._fx = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
        this._fy = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
        this._fz = new OneEuroFilter(freq, minCutoff, beta, dCutoff);
    }
    reset() { this._fx.reset(); this._fy.reset(); this._fz.reset(); }
    filter(vec3, timestamp = null) {
        return new THREE.Vector3(
            this._fx.filter(vec3.x, timestamp),
            this._fy.filter(vec3.y, timestamp),
            this._fz.filter(vec3.z, timestamp)
        );
    }
}

// ============================================================
// DraggablePanel - 统一的可拖动面板类
// ============================================================
class DraggablePanel {
    static instances = [];
    static snapDistance = 20;
    static activePanel = null;  // 当前正在拖动的面板

    /**
     * @param {HTMLElement} element - 面板 DOM 元素（需包含 .panel-header 子元素作为拖拽手柄）
     * @param {Object} options
     * @param {boolean} options.saveable - 是否持久化位置到 localStorage（默认 true）
     */
    constructor(element, options = {}) {
        this.element = element;
        this.saveable = options.saveable !== false;
        this._isDragging = false;
        this._isResizing = false;
        this._startX = 0;
        this._startY = 0;
        this._startLeft = 0;
        this._startTop = 0;
        this._resizeStartW = 0;
        this._resizeStartH = 0;
        this._minimized = false;
        this._fabTab = null;  // 最小化后在悬浮球中的标签

        this._bindEvents();
        this._initResize();
        DraggablePanel.instances.push(this);
    }

    _bindEvents() {
        const header = this.element.querySelector('.panel-header');
        if (!header) return;

        // 最小化按钮 → 收入悬浮球
        const minimizeBtn = this.element.querySelector('.panel-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.minimize();
            });
        }

        // 拖拽开始
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;

            this._isDragging = true;
            DraggablePanel.activePanel = this;

            const rect = this.element.getBoundingClientRect();
            this._startX = e.clientX;
            this._startY = e.clientY;
            this._startLeft = rect.left;
            this._startTop = rect.top;

            // 统一切换到 left/top 绝对定位
            this.element.style.left = rect.left + 'px';
            this.element.style.top = rect.top + 'px';
            this.element.style.right = 'auto';
            this.element.style.bottom = 'auto';
            this.element.style.transform = 'none';

            // 提升当前面板层级
            DraggablePanel.instances.forEach(p => p.element.style.zIndex = 100);
            this.element.style.zIndex = 200;

            document.body.style.cursor = 'grabbing';
            e.preventDefault();
        });

        // 统一的 mousemove / mouseup（拖拽 + 缩放共用）
        this._onMouseMove = (e) => {
            if (this._isDragging) {
                const dx = e.clientX - this._startX;
                const dy = e.clientY - this._startY;
                this.element.style.left = (this._startLeft + dx) + 'px';
                this.element.style.top = (this._startTop + dy) + 'px';
                this._showSnapIndicator();
            }
            if (this._isResizing) {
                const newW = this._resizeStartW + (e.clientX - this._startX);
                const newH = this._resizeStartH + (e.clientY - this._startY);
                this.element.style.width = Math.max(150, newW) + 'px';
                this.element.style.height = Math.max(80, newH) + 'px';
                this.element.style.maxWidth = 'none';
                this.element.style.maxHeight = 'none';
            }
        };

        this._onMouseUp = () => {
            if (this._isDragging) {
                this._isDragging = false;
                DraggablePanel.activePanel = null;
                const indicator = document.querySelector('.snap-indicator');
                if (indicator) indicator.remove();
                this._applySnap();
                if (this.saveable) DraggablePanel.savePositions();
            }
            if (this._isResizing) {
                this._isResizing = false;
                DraggablePanel.activePanel = null;
            }
            document.body.style.cursor = 'default';
        };

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    // ---- 最小化到悬浮球 / 恢复 ----

    minimize() {
        if (this._minimized) return;
        this._minimized = true;
        this.element.classList.add('hidden-to-fab');

        // 从 panel-header 中提取标题文本
        const headerSpan = this.element.querySelector('.panel-header > span');
        const title = headerSpan ? headerSpan.textContent.trim() : (this.element.id || '面板');

        // 创建 FAB 中的标签按钮
        const tab = document.createElement('button');
        tab.className = 'fab-minimized-tab';
        tab.textContent = title;
        tab.title = `恢复「${title}」`;
        tab.addEventListener('click', (e) => {
            e.stopPropagation();
            this.restore();
        });

        const container = document.getElementById('fab-minimized-tabs');
        if (container) {
            container.appendChild(tab);
        }
        this._fabTab = tab;

        // 展开 FAB 让用户看到新增的标签
        const fab = document.getElementById('controls-fab');
        if (fab && fab.classList.contains('collapsed')) {
            fab.classList.remove('collapsed');
            fab.classList.add('expanded');
        }
    }

    restore() {
        if (!this._minimized) return;
        this._minimized = false;
        this.element.classList.remove('hidden-to-fab');

        // 移除 FAB 中的标签
        if (this._fabTab) {
            this._fabTab.remove();
            this._fabTab = null;
        }
    }

    _initResize() {
        const handle = document.createElement('div');
        handle.className = 'panel-resize-handle';
        this.element.appendChild(handle);

        handle.addEventListener('mousedown', (e) => {
            this._isResizing = true;
            DraggablePanel.activePanel = this;

            this._startX = e.clientX;
            this._startY = e.clientY;
            this._resizeStartW = this.element.offsetWidth;
            this._resizeStartH = this.element.offsetHeight;

            // 提升层级
            DraggablePanel.instances.forEach(p => p.element.style.zIndex = 100);
            this.element.style.zIndex = 200;

            document.body.style.cursor = 'nwse-resize';
            e.preventDefault();
            e.stopPropagation();
        });
    }

    _showSnapIndicator() {
        const existing = document.querySelector('.snap-indicator');
        if (existing) existing.remove();

        const rect = this.element.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sd = DraggablePanel.snapDistance;

        let snapPos = null;

        if (rect.left < sd)
            snapPos = { x: 0, y: rect.top, w: rect.width, h: rect.height };
        else if (rect.right > vw - sd)
            snapPos = { x: vw - rect.width, y: rect.top, w: rect.width, h: rect.height };
        else if (rect.top < sd)
            snapPos = { x: rect.left, y: 0, w: rect.width, h: rect.height };
        else if (rect.bottom > vh - sd - 60)
            snapPos = { x: rect.left, y: vh - rect.height - 60, w: rect.width, h: rect.height };

        if (snapPos) {
            const indicator = document.createElement('div');
            indicator.className = 'snap-indicator';
            indicator.style.left = snapPos.x + 'px';
            indicator.style.top = snapPos.y + 'px';
            indicator.style.width = snapPos.w + 'px';
            indicator.style.height = snapPos.h + 'px';
            document.body.appendChild(indicator);
        }
    }

    _applySnap() {
        const rect = this.element.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sd = DraggablePanel.snapDistance;

        let newLeft = rect.left;
        let newTop = rect.top;

        if (rect.left < sd) newLeft = 20;
        else if (rect.right > vw - sd) newLeft = vw - rect.width - 20;

        if (rect.top < sd) newTop = 20;
        else if (rect.bottom > vh - sd - 60) newTop = vh - rect.height - 60;

        this.element.style.left = newLeft + 'px';
        this.element.style.top = newTop + 'px';
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
    }

    destroy() {
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);
        const handle = this.element.querySelector('.panel-resize-handle');
        if (handle) handle.remove();
        const idx = DraggablePanel.instances.indexOf(this);
        if (idx !== -1) DraggablePanel.instances.splice(idx, 1);
    }

    // ---- 静态方法：全局位置管理 ----

    static savePositions() {
        const positions = {};
        DraggablePanel.instances.forEach(p => {
            if (p.saveable && p.element.id) {
                positions[p.element.id] = {
                    left: p.element.offsetLeft,
                    top: p.element.offsetTop
                };
            }
        });
        localStorage.setItem('panelPositions', JSON.stringify(positions));
    }

    static loadPositions() {
        const saved = localStorage.getItem('panelPositions');
        if (!saved) return;

        try {
            const positions = JSON.parse(saved);
            Object.keys(positions).forEach(id => {
                const panel = document.getElementById(id);
                if (panel && positions[id]) {
                    panel.style.left = positions[id].left + 'px';
                    panel.style.top = positions[id].top + 'px';
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
            });
        } catch (e) {
            console.error('加载面板位置失败:', e);
        }
    }
}

// ============================================================
// Viewer3D - 3D 点云查看器
// ============================================================
class Viewer3D {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.data = null;
        this.autoRotate = true;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        // 点选交互
        this.selectedPointIndex = null;
        this.neighborRadius = 0;       // 实际绝对半径（由 _radiusRatio * _maxRadius 得出）
        this._radiusRatio = 0.15;      // 半径比例 0-1
        this._maxRadius = 1;           // 选中点到最远点的距离
        this.originalColors = null;
        this.pickMode = false;
        this._imageObserver = null;
        
        // 外观参数（可通过设置面板调整）
        this.pointSize = 2;
        this.pointOpacity = 0.9;
        this.hoverScale = 3;
        this.rotateSpeed = 2.0;
        this.camSmooth = 0.15;
        
        // 选择半径球体
        this._radiusSphere = null;
        
        // 相机平滑过渡（1€ 滤波器）
        this._camTargetFilter = new OneEuroVector3Filter(60, this.camSmooth, 0.1, 1.0);
        this._camPosFilter = new OneEuroVector3Filter(60, this.camSmooth, 0.1, 1.0);
        this._camTransition = null;  // { targetPos, targetLookAt, startTime }
        this._savedCamState = null;  // 选点前的相机状态 { position, target }
        this._isRecording = false;
        this._mediaRecorder = null;
        
        this.init();
        this.initDraggableWindows();
        this.initSelectionCard();
        this.initFilterCard();
        this.initScreenshotCard();
        this.initDataPanel();
        
        setTimeout(() => DraggablePanel.loadPositions(), 100);
    }
    
    initDraggableWindows() {
        // 为所有静态面板创建 DraggablePanel 实例
        document.querySelectorAll('.draggable-panel').forEach(panel => {
            new DraggablePanel(panel);
        });
        
        this.addLayoutButton();
    }
    
    autoLayout() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        const layouts = [
            { id: 'info-panel', left: 20, top: 20 },
            { id: 'filter-card', left: 20, top: 260 },
            { id: 'screenshot-card', left: viewportWidth - 300, top: viewportHeight - 240 },
            { id: 'data-panel', left: viewportWidth - 420, top: 20 },
            { id: 'log-panel', left: viewportWidth - 620, top: viewportHeight - 380 }
        ];
        
        layouts.forEach(layout => {
            const panel = document.getElementById(layout.id);
            if (panel) {
                panel.style.left = layout.left + 'px';
                panel.style.top = layout.top + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
        });
        
        DraggablePanel.savePositions();
    }
    
    addLayoutButton() {
        const panel = document.getElementById('fab-panel');
        if (!panel) return;
        
        const btnLayout = document.createElement('button');
        btnLayout.id = 'btn-layout';
        btnLayout.textContent = '📐 自动排版';
        btnLayout.addEventListener('click', () => this.autoLayout());
        panel.appendChild(btnLayout);
    }
    
    initDataPanel() {
        console.log('初始化数据面板...');
        
        this.logAutoScroll = true;
        this.logInterval = null;
        this.initLogPanel();
        
        console.log('初始化点选交互...');
        this.initPointSelection();

        try {
            const fileUpload = document.getElementById('file-upload');
            const serverPathInput = document.getElementById('server-path-input');
            const btnBrowse = document.getElementById('btn-browse');
            const btnLoad = document.getElementById('btn-load');

            if (!fileUpload || !serverPathInput || !btnBrowse || !btnLoad) {
                console.error('数据面板：必要元素未找到', { fileUpload, serverPathInput, btnBrowse, btnLoad });
                return;
            }

            // 两个输入源互斥
            fileUpload.addEventListener('change', () => {
                if (fileUpload.files.length > 0) {
                    serverPathInput.value = '';
                }
            });

            serverPathInput.addEventListener('input', () => {
                if (serverPathInput.value.trim()) {
                    fileUpload.value = '';
                }
            });

            // 文件浏览器弹窗
            const modal = document.getElementById('browse-modal');
            const browseList = document.getElementById('browse-list');
            const browseCurrentPath = document.getElementById('browse-current-path');
            const btnBrowseUp = document.getElementById('btn-browse-up');
            const btnBrowseCancel = document.getElementById('btn-browse-cancel');
            let browseParentPath = null;

            const browseTo = async (path) => {
                try {
                    browseList.innerHTML = '<div style="padding:20px;color:#9ca3af;text-align:center">加载中...</div>';
                    const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse';
                    const res = await fetch(url);
                    const data = await res.json();
                    if (data.error) { alert(data.error); return; }

                    browseCurrentPath.textContent = data.current;
                    browseParentPath = data.parent;
                    btnBrowseUp.disabled = !data.parent;

                    browseList.innerHTML = '';
                    data.dirs.forEach(d => {
                        const el = document.createElement('div');
                        el.className = 'browse-item dir';
                        el.innerHTML = `<span class="icon">📁</span><span>${d.name}</span>`;
                        el.addEventListener('click', () => browseTo(d.path));
                        browseList.appendChild(el);
                    });
                    data.files.forEach(f => {
                        const el = document.createElement('div');
                        el.className = 'browse-item file';
                        el.innerHTML = `<span class="icon">📄</span><span>${f.name}</span>`;
                        el.addEventListener('click', () => {
                            serverPathInput.value = f.path;
                            fileUpload.value = '';
                            modal.classList.remove('open');
                        });
                        browseList.appendChild(el);
                    });

                    if (data.dirs.length === 0 && data.files.length === 0) {
                        browseList.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">此目录下没有子目录或 .txt 文件</div>';
                    }
                } catch (err) {
                    console.error('浏览目录失败:', err);
                    browseList.innerHTML = `<div style="padding:20px;color:#f87171;text-align:center">加载失败：${err.message}</div>`;
                }
            };

            if (modal && btnBrowseUp && btnBrowseCancel) {
                btnBrowse.addEventListener('click', () => {
                    const startPath = serverPathInput.value.trim() || null;
                    modal.classList.add('open');
                    browseTo(startPath);
                });

                btnBrowseUp.addEventListener('click', () => {
                    if (browseParentPath) browseTo(browseParentPath);
                });

                btnBrowseCancel.addEventListener('click', () => modal.classList.remove('open'));
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
            } else {
                console.error('浏览弹窗元素未找到', { modal, btnBrowseUp, btnBrowseCancel });
            }

            btnLoad.addEventListener('click', async () => {
                const uploadedFile = fileUpload.files[0];
                const serverPath = serverPathInput.value.trim();

                if (!uploadedFile && !serverPath) {
                    this.showStatus('请上传文件或指定服务器路径', 'error');
                    return;
                }

                this.setProcessing(true);
                this.clearLog();
                this.addLog('🚀 开始处理...', 'highlight');

                try {
                    let formData = new FormData();

                    if (serverPath) {
                        formData.append('type', 'server_path');
                        formData.append('server_path', serverPath);
                    } else {
                        formData.append('file', uploadedFile);
                        formData.append('type', 'upload');
                    }
                
                const response = await fetch('/api/process', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.skipped) {
                        this.addLog('✅ ' + result.message, 'success');
                        setTimeout(() => this.loadDataByFilename(result.output), 1000);
                    } else {
                        this.addLog('✅ 处理任务已启动，正在后台运行...', 'success');
                        this.startLogPolling(result.output);
                    }
                } else {
                    this.showStatus('❌ ' + result.error, 'error');
                    this.addLog('❌ ' + result.error, 'error');
                }
            } catch (error) {
                this.showStatus('❌ 处理失败：' + error.message, 'error');
                this.addLog('❌ ' + error.message, 'error');
            } finally {
                this.setProcessing(false);
            }
        });
        } catch (e) {
            console.error('数据面板初始化失败:', e);
        }
    }
    
    initLogPanel() {
        const btnLogScroll = document.getElementById('btn-log-scroll');
        const btnLogClear = document.getElementById('btn-log-clear');
        const btnLogCollapse = document.getElementById('btn-log-collapse');
        const logPanel = document.getElementById('log-panel');
        
        btnLogScroll.addEventListener('click', () => {
            this.logAutoScroll = !this.logAutoScroll;
            btnLogScroll.classList.toggle('active', this.logAutoScroll);
        });
        
        btnLogClear.addEventListener('click', () => {
            this.clearLog();
        });
        
        btnLogCollapse.addEventListener('click', () => {
            logPanel.classList.toggle('collapsed');
            btnLogCollapse.textContent = logPanel.classList.contains('collapsed') ? '📏' : '📐';
        });
    }
    
    // ---- 采点卡片：初始化时创建，始终可见 ----
    
    initSelectionCard() {
        const card = document.createElement('div');
        card.id = 'selection-card';
        card.className = 'draggable-panel';
        card.innerHTML = `
            <div class="panel-header">
                <span>🖼️ 相邻图片</span>
                <div style="display:flex;gap:4px;">
                    <button id="btn-pick" title="采点工具">🔍</button>
                    <button id="btn-clear-pick" title="清除选择">🗑️</button>
                    <button class="panel-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="panel-content">
                <div class="card-radius-control">
                    <label>半径：<span id="radius-value" title="双击输入">${this._radiusRatio.toFixed(2)}</span></label>
                    <input type="range" id="radius-slider" min="0" max="1" step="0.01" value="${this._radiusRatio}">
                </div>
                <div class="card-images" id="card-images">
                    <span class="card-placeholder">点击 🔍 启用采点工具，再点击点云采点</span>
                </div>
            </div>
        `;
        document.body.appendChild(card);
        
        new DraggablePanel(card, { saveable: false });
        
        // 采点工具开关
        document.getElementById('btn-pick').addEventListener('click', () => {
            this.togglePickMode();
        });
        
        // 清除选择
        document.getElementById('btn-clear-pick').addEventListener('click', () => {
            this.deselectPoint();
        });
        
        // 半径滑块（0-1 比例）
        document.getElementById('radius-slider').addEventListener('input', (e) => {
            this._radiusRatio = parseFloat(e.target.value);
            this.neighborRadius = this._radiusRatio * this._maxRadius;
            document.getElementById('radius-value').textContent = this._radiusRatio.toFixed(2);
            
            if (this.selectedPointIndex !== null) {
                const neighbors = this.findNeighbors(this.selectedPointIndex, this.neighborRadius);
                this.updateSelectionImages(neighbors);
                this.updatePointColors(neighbors);
                this._updateRadiusSphere(this.selectedPointIndex, this.neighborRadius);
            }
        });

        // 双击半径数值可输入
        const radiusControl = card.querySelector('.card-radius-control');
        radiusControl.addEventListener('dblclick', (e) => {
            const radiusSpan = document.getElementById('radius-value');
            if (!radiusSpan || e.target !== radiusSpan) return;
            e.stopPropagation();
            
            const current = this._radiusRatio;
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.max = '1';
            input.step = '0.01';
            input.value = current.toFixed(2);
            input.style.cssText = 'width:52px;background:rgba(255,255,255,0.1);border:1px solid #60a5fa;border-radius:4px;color:#60a5fa;font-size:13px;font-weight:600;padding:1px 4px;text-align:center;outline:none;';
            
            radiusSpan.replaceWith(input);
            input.focus();
            input.select();
            
            const commit = () => {
                let v = parseFloat(input.value);
                if (isNaN(v)) v = current;
                v = Math.max(0, Math.min(1, v));
                this._radiusRatio = v;
                this.neighborRadius = v * this._maxRadius;
                
                const span = document.createElement('span');
                span.id = 'radius-value';
                span.title = '双击输入';
                span.style.cursor = 'pointer';
                span.textContent = v.toFixed(2);
                input.replaceWith(span);
                
                document.getElementById('radius-slider').value = v;
                
                if (this.selectedPointIndex !== null) {
                    const neighbors = this.findNeighbors(this.selectedPointIndex, this.neighborRadius);
                    this.updateSelectionImages(neighbors);
                    this.updatePointColors(neighbors);
                    this._updateRadiusSphere(this.selectedPointIndex, this.neighborRadius);
                }
            };
            
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') input.blur();
                if (ev.key === 'Escape') { input.value = current.toFixed(2); input.blur(); }
            });
        });
    }
    
    togglePickMode() {
        this.pickMode = !this.pickMode;
        
        const btn = document.getElementById('btn-pick');
        btn.classList.toggle('active', this.pickMode);
        
        // 切换画布光标
        document.getElementById('canvas-container').classList.toggle('pick-mode', this.pickMode);
    }
    
    // ---- 过滤器卡片 ----
    
    initFilterCard() {
        this._filterData = null;      // 可用过滤器列表（从后端获取）
        this._activeFilter = null;    // 当前选中的过滤器名称
        this._filterParams = {};      // 当前参数值
        this._filteredIndices = null; // 当前过滤结果（null = 未过滤）
        
        const card = document.createElement('div');
        card.id = 'filter-card';
        card.className = 'draggable-panel';
        card.innerHTML = `
            <div class="panel-header">
                <span>🔖 数据过滤</span>
                <div style="display:flex;gap:4px;">
                    <button class="panel-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="panel-content" style="padding:0;display:flex;flex-direction:column;">
                <div class="filter-select-row">
                    <label>过滤方法</label>
                    <select id="filter-method-select">
                        <option value="">-- 请选择 --</option>
                    </select>
                </div>
                <div class="filter-params" id="filter-params-container"></div>
                <div class="filter-actions">
                    <button id="btn-filter-apply">应用过滤</button>
                    <button id="btn-filter-reset">重置</button>
                </div>
                <div class="filter-status" id="filter-status"></div>
            </div>
        `;
        document.body.appendChild(card);
        
        new DraggablePanel(card, { saveable: true });
        
        // 过滤方法切换
        document.getElementById('filter-method-select').addEventListener('change', (e) => {
            this._activeFilter = e.target.value || null;
            this._filterParams = {};
            this._renderFilterParams();
        });
        
        // 应用过滤
        document.getElementById('btn-filter-apply').addEventListener('click', () => {
            this._applyFilter();
        });
        
        // 重置
        document.getElementById('btn-filter-reset').addEventListener('click', () => {
            this._resetFilter();
        });
    }

    initScreenshotCard() {
        const card = document.createElement('div');
        card.id = 'screenshot-card';
        card.className = 'draggable-panel';
        card.innerHTML = `
            <div class="panel-header">
                <span>📷 截图</span>
                <div style="display:flex;gap:4px;">
                    <button class="panel-minimize" title="最小化">−</button>
                </div>
            </div>
            <div class="panel-content screenshot-body">
                <div class="screenshot-toggle">
                    <span>包含界面面板</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="screenshot-include-ui">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="screenshot-buttons">
                    <button id="btn-take-screenshot">📷 拍照</button>
                    <button id="btn-record">⏺ 录像</button>
                </div>
            </div>
        `;
        document.body.appendChild(card);

        new DraggablePanel(card, { saveable: true });

        document.getElementById('btn-take-screenshot').addEventListener('click', () => {
            const includeUI = document.getElementById('screenshot-include-ui').checked;
            this.takeScreenshot(includeUI);
        });

        document.getElementById('btn-record').addEventListener('click', () => {
            if (this._isRecording) {
                this.stopRecording();
            } else {
                const includeUI = document.getElementById('screenshot-include-ui').checked;
                this.startRecording(includeUI);
            }
        });
    }

    /**
     * 数据加载完成后调用，向后端请求可用过滤器
     */
    async _loadFilters() {
        const card = document.getElementById('filter-card');
        if (!card) return;
        
        try {
            const res = await fetch('/api/filters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: this.data.points })
            });
            const result = await res.json();
            
            if (!result.has_labels || !result.filters || result.filters.length === 0) {
                card.classList.remove('visible');
                this._filterData = null;
                return;
            }
            
            this._filterData = result.filters;
            
            // 填充过滤方法下拉
            const select = document.getElementById('filter-method-select');
            select.innerHTML = '<option value="">-- 请选择 --</option>';
            result.filters.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.display_name;
                select.appendChild(opt);
            });
            
            // 重置状态
            this._activeFilter = null;
            this._filterParams = {};
            this._filteredIndices = null;
            document.getElementById('filter-params-container').innerHTML = '';
            document.getElementById('filter-status').textContent = '';
            
            card.classList.add('visible');
        } catch (err) {
            console.error('加载过滤器失败:', err);
            card.classList.remove('visible');
        }
    }
    
    /**
     * 根据当前选中的过滤器，渲染参数控件
     */
    _renderFilterParams() {
        const container = document.getElementById('filter-params-container');
        container.innerHTML = '';
        
        if (!this._activeFilter || !this._filterData) return;
        
        const filterInfo = this._filterData.find(f => f.name === this._activeFilter);
        if (!filterInfo) return;
        
        filterInfo.params.forEach(param => {
            const group = document.createElement('div');
            group.className = 'filter-param-group';
            
            const label = document.createElement('label');
            label.textContent = param.label;
            group.appendChild(label);
            
            switch (param.type) {
                case 'select':
                    this._renderSelectParam(group, param);
                    break;
                case 'multi_select':
                    this._renderMultiSelectParam(group, param);
                    break;
                case 'range':
                    this._renderRangeParam(group, param);
                    break;
                case 'text':
                    this._renderTextParam(group, param);
                    break;
            }
            
            container.appendChild(group);
        });
    }
    
    _renderSelectParam(group, param) {
        const select = document.createElement('select');
        select.style.cssText = 'width:100%;padding:7px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:#fff;font-size:13px;outline:none;';
        
        (param.options || []).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            o.style.cssText = 'background:#1a1a2e;color:#fff;';
            if (opt === param.default) o.selected = true;
            select.appendChild(o);
        });
        
        this._filterParams[param.key] = param.default || (param.options ? param.options[0] : '');
        select.addEventListener('change', () => {
            this._filterParams[param.key] = select.value;
        });
        
        group.appendChild(select);
    }
    
    _renderMultiSelectParam(group, param) {
        const options = param.options || [];
        const defaults = new Set(param.default || options);
        this._filterParams[param.key] = [...defaults];
        
        // 全选 / 全不选 按钮
        const actions = document.createElement('div');
        actions.className = 'filter-chip-actions';
        
        const btnAll = document.createElement('button');
        btnAll.textContent = '全选';
        
        const btnNone = document.createElement('button');
        btnNone.textContent = '全不选';
        
        const btnInvert = document.createElement('button');
        btnInvert.textContent = '反选';
        
        actions.appendChild(btnAll);
        actions.appendChild(btnNone);
        actions.appendChild(btnInvert);
        group.appendChild(actions);
        
        const grid = document.createElement('div');
        grid.className = 'filter-checkbox-grid';
        
        const chips = [];
        
        options.forEach(opt => {
            const chip = document.createElement('span');
            chip.className = 'filter-chip' + (defaults.has(opt) ? ' selected' : '');
            chip.textContent = opt;
            chip.dataset.value = opt;
            
            chip.addEventListener('click', () => {
                chip.classList.toggle('selected');
                this._syncMultiSelect(param.key, chips);
            });
            
            chips.push(chip);
            grid.appendChild(chip);
        });
        
        btnAll.addEventListener('click', () => {
            chips.forEach(c => c.classList.add('selected'));
            this._syncMultiSelect(param.key, chips);
        });
        
        btnNone.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('selected'));
            this._syncMultiSelect(param.key, chips);
        });
        
        btnInvert.addEventListener('click', () => {
            chips.forEach(c => c.classList.toggle('selected'));
            this._syncMultiSelect(param.key, chips);
        });
        
        group.appendChild(grid);
    }
    
    _syncMultiSelect(key, chips) {
        this._filterParams[key] = chips
            .filter(c => c.classList.contains('selected'))
            .map(c => c.dataset.value);
    }
    
    _renderRangeParam(group, param) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = param.min ?? 0;
        slider.max = param.max ?? 100;
        slider.step = param.step ?? 1;
        slider.value = param.default ?? param.min ?? 0;
        slider.style.flex = '1';
        
        const valueLabel = document.createElement('span');
        valueLabel.style.cssText = 'color:#60a5fa;font-size:13px;font-weight:600;min-width:40px;text-align:right;';
        valueLabel.textContent = slider.value;
        
        this._filterParams[param.key] = parseFloat(slider.value);
        slider.addEventListener('input', () => {
            valueLabel.textContent = slider.value;
            this._filterParams[param.key] = parseFloat(slider.value);
        });
        
        row.appendChild(slider);
        row.appendChild(valueLabel);
        group.appendChild(row);
    }
    
    _renderTextParam(group, param) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = param.label || '';
        input.value = param.default || '';
        
        this._filterParams[param.key] = input.value;
        input.addEventListener('input', () => {
            this._filterParams[param.key] = input.value;
        });
        
        group.appendChild(input);
    }
    
    async _applyFilter() {
        if (!this._activeFilter) return;
        
        const statusEl = document.getElementById('filter-status');
        statusEl.textContent = '过滤中...';
        
        try {
            const res = await fetch('/api/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filter_name: this._activeFilter,
                    params: this._filterParams,
                    points: this.data.points
                })
            });
            const result = await res.json();
            
            if (result.error) {
                statusEl.textContent = '过滤失败：' + result.error;
                return;
            }
            
            this._filteredIndices = new Set(result.indices);
            // 清除当前选点（选中的点或邻居可能被过滤掉），deselectPoint 会自动应用过滤着色
            this.deselectPoint();
            
            statusEl.innerHTML = `显示 <span class="count">${result.filtered}</span> / ${result.total} 个点`;
        } catch (err) {
            console.error('应用过滤失败:', err);
            statusEl.textContent = '过滤失败：' + err.message;
        }
    }
    
    _resetFilter() {
        this._filteredIndices = null;
        // 清除当前选点，恢复全部颜色
        this.deselectPoint();
        document.getElementById('filter-status').textContent = '';
        
        // 重置下拉
        const select = document.getElementById('filter-method-select');
        if (select) select.value = '';
        this._activeFilter = null;
        this._filterParams = {};
        document.getElementById('filter-params-container').innerHTML = '';
    }
    
    _applyFilterToPointCloud() {
        if (!this.points || !this._filteredIndices) return;
        
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        const positions = this.points.geometry.attributes.position;
        
        for (let i = 0; i < colors.count; i++) {
            if (this._filteredIndices.has(i)) {
                colors.setXYZ(i,
                    originalColors[i * 3],
                    originalColors[i * 3 + 1],
                    originalColors[i * 3 + 2]
                );
            } else {
                colors.setXYZ(i, 0.08, 0.08, 0.08);
            }
        }
        
        colors.needsUpdate = true;
    }
    
    _restoreAllPointVisibility() {
        if (!this.points || !this.points.userData.originalColors) return;
        
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        
        for (let i = 0; i < colors.count; i++) {
            colors.setXYZ(i,
                originalColors[i * 3],
                originalColors[i * 3 + 1],
                originalColors[i * 3 + 2]
            );
        }
        colors.needsUpdate = true;
    }
    
    // ---- 点击交互：仅在采点模式下生效 ----
    
    initPointSelection() {
        // 使用 pointerdown/pointerup 代替 click，避免 OrbitControls 微量拖拽吞掉 click 事件
        let pointerDownPos = null;
        
        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (!this.pickMode || e.button !== 0) return;
            pointerDownPos = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('pointerup', (e) => {
            if (!this.pickMode || e.button !== 0 || !pointerDownPos) return;
            if (DraggablePanel.activePanel) { pointerDownPos = null; return; }
            
            // 移动超过 5px 视为拖拽，不触发选点
            const dx = e.clientX - pointerDownPos.x;
            const dy = e.clientY - pointerDownPos.y;
            pointerDownPos = null;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return;
            
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.raycaster.params.Points.threshold = 0.5;
            
            if (this.points) {
                const intersects = this.raycaster.intersectObject(this.points);
                
                const index = this._pickClosestToRay(intersects);
                if (index >= 0) {
                    this.selectPoint(index);
                }
            }
        });
        
        // 右键预览图片
        let rightDownPos = null;
        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            if (e.button === 2) rightDownPos = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.points || !rightDownPos) return;
            const dx = e.clientX - rightDownPos.x;
            const dy = e.clientY - rightDownPos.y;
            rightDownPos = null;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return;

            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.raycaster.params.Points.threshold = 0.5;

            const intersects = this.raycaster.intersectObject(this.points);
            const idx = this._pickClosestToRay(intersects);
            if (idx >= 0) {
                this._showImagePreview(idx, e.clientX, e.clientY);
            }
        });
    }
    
    /**
     * 右键预览：在鼠标位置弹出图片预览窗口
     */
    _showImagePreview(index, clientX, clientY) {
        const p = this.points.userData.pointsData[index];
        const popup = document.getElementById('image-preview-popup');
        const img = document.getElementById('preview-img');
        const title = document.getElementById('preview-title');

        const imgUrl = '/api/image?path=' + encodeURIComponent(p.image_path);
        img.src = imgUrl;
        title.textContent = p.image_path.split('/').pop();
        title.title = p.image_path;

        // 将右键点钉入高亮缓冲区 slot 1
        this._hlPinnedIdx = index;
        // 如果悬浮槽碰巧是同一个点，清空悬浮槽避免重复
        if (this._hlHoverIdx === index) this._hlHoverIdx = -1;
        this._syncHighlightBuffer();

        popup.classList.add('visible');

        // 有上次位置则复用，否则定位到鼠标附近
        if (this._previewLastPos) {
            popup.style.left = this._previewLastPos.x + 'px';
            popup.style.top = this._previewLastPos.y + 'px';
        } else {
            requestAnimationFrame(() => {
                const rect = popup.getBoundingClientRect();
                let x = clientX + 8;
                let y = clientY + 8;
                if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - 8;
                if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - 8;
                x = Math.max(8, x);
                y = Math.max(8, y);
                popup.style.left = x + 'px';
                popup.style.top = y + 'px';
                this._previewLastPos = { x, y };
            });
        }
    }
    
    _closeImagePreview() {
        const popup = document.getElementById('image-preview-popup');
        // 记住当前位置
        if (popup.classList.contains('visible')) {
            const rect = popup.getBoundingClientRect();
            this._previewLastPos = { x: rect.left, y: rect.top };
        }
        popup.classList.remove('visible');
        // 从高亮缓冲区移除钉住的点
        this._hlPinnedIdx = -1;
        this._syncHighlightBuffer();
    }

    selectPoint(index) {
        const isFirstSelection = this.selectedPointIndex === null;
        this.selectedPointIndex = index;
        
        // 计算最远距离，将比例转为绝对半径
        this._maxRadius = this._computeMaxRadius(index);
        this.neighborRadius = this._radiusRatio * this._maxRadius;
        
        const neighbors = this.findNeighbors(index, this.neighborRadius);
        this.updateSelectionImages(neighbors);
        this.updatePointColors(neighbors);
        this._updateRadiusSphere(index, this.neighborRadius);
        
        // 相机聚焦到选中点
        this._flyToPoint(index, isFirstSelection);
    }
    
    /**
     * 从 raycaster 交点列表中，选出视觉上最接近鼠标的有效点。
     * 按 distanceToRay（射线垂直距离）排序，而非按 distance（相机距离）排序。
     * @returns {number} 点索引，无命中返回 -1
     */
    _pickClosestToRay(intersects) {
        let bestIndex = -1;
        let bestDist = Infinity;
        
        for (const hit of intersects) {
            const idx = hit.instanceId !== undefined ? hit.instanceId : hit.index;
            // 跳过被过滤掉的点
            if (this._filteredIndices && !this._filteredIndices.has(idx)) continue;
            
            if (hit.distanceToRay < bestDist) {
                bestDist = hit.distanceToRay;
                bestIndex = idx;
            }
        }
        
        return bestIndex;
    }
    
    /**
     * 将数据坐标转为世界坐标（考虑点云偏移）
     */
    _dataToWorld(p) {
        const offset = this.points.position;
        return new THREE.Vector3(p.x + offset.x, p.y + offset.y, p.z + offset.z);
    }
    
    /**
     * 将活跃的高亮槽位写入缓冲区并更新 drawRange
     * slot 0 = 悬浮点, slot 1 = 右键钉住点
     */
    _syncHighlightBuffer() {
        if (!this._highlightPoint || !this.points) return;
        const geo = this._highlightPoint.geometry;
        const pos = geo.attributes.position;
        const col = geo.attributes.color;
        const origColors = this.points.userData.originalColors;
        const pointsData = this.points.userData.pointsData;
        
        let count = 0;
        const slots = [this._hlHoverIdx, this._hlPinnedIdx];
        for (const idx of slots) {
            if (idx < 0) continue;
            const p = pointsData[idx];
            pos.setXYZ(count, p.x, p.y, p.z);
            col.setXYZ(count, origColors[idx * 3], origColors[idx * 3 + 1], origColors[idx * 3 + 2]);
            count++;
        }
        
        pos.needsUpdate = true;
        col.needsUpdate = true;
        geo.setDrawRange(0, count);
        this._highlightPoint.visible = count > 0;
    }
    
    /**
     * 更新选择半径指示球的位置和大小
     */
    _updateRadiusSphere(index, radius) {
        if (!this._radiusSphere || !this.points) return;
        const p = this.points.userData.pointsData[index];
        const worldPos = this._dataToWorld(p);
        this._radiusSphere.position.copy(worldPos);
        this._radiusSphere.scale.setScalar(radius);
        this._radiusSphere.visible = true;
        // 虚线比例需要随缩放调整
        this._radiusSphere.computeLineDistances();
    }
    
    _hideRadiusSphere() {
        if (this._radiusSphere) this._radiusSphere.visible = false;
    }
    
    /**
     * 相机飞向选中点
     */
    _flyToPoint(index, isFirstSelection) {
        const p = this.points.userData.pointsData[index];
        const worldPos = this._dataToWorld(p);
        
        // 首次选点时保存当前相机状态，用于取消时恢复
        if (isFirstSelection) {
            this._savedCamState = {
                position: this.camera.position.clone(),
                target: this.controls.target.clone()
            };
        }
        
        // 计算目标相机位置：从当前视角方向看向选中点，拉近到邻域半径的 2 倍距离
        const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
        const flyDist = Math.max(this.neighborRadius * 2.0, 3.0);
        const targetCamPos = new THREE.Vector3().copy(worldPos).addScaledVector(dir, flyDist);
        
        this._startCameraTransition(targetCamPos, worldPos);
    }
    
    /**
     * 相机恢复到选点前的全局视角
     */
    _flyToOverview() {
        if (!this._savedCamState) return;
        this._startCameraTransition(this._savedCamState.position, this._savedCamState.target);
        this._savedCamState = null;
    }
    
    /**
     * 启动相机过渡动画（重置 1€ 滤波器，以当前位置为起点）
     */
    _startCameraTransition(targetPos, targetLookAt) {
        const now = performance.now() / 1000;
        
        // 重置并以当前位置播种，避免第一帧跳变
        this._camTargetFilter.reset();
        this._camPosFilter.reset();
        this._camTargetFilter.filter(this.controls.target.clone(), now);
        this._camPosFilter.filter(this.camera.position.clone(), now);
        
        this._camTransition = {
            targetPos: targetPos.clone(),
            targetLookAt: targetLookAt.clone(),
            startTime: performance.now()
        };
        // 过渡期间禁用 OrbitControls 的自主更新，避免冲突
        if (this.controls) this.controls.enabled = false;
    }
    
    /**
     * 每帧更新相机过渡（在 animate 中调用）
     */
    _updateCameraTransition() {
        if (!this._camTransition) return;
        
        const now = performance.now() / 1000;  // 秒
        
        const filteredTarget = this._camTargetFilter.filter(this._camTransition.targetLookAt, now);
        const filteredPos = this._camPosFilter.filter(this._camTransition.targetPos, now);
        
        this.controls.target.copy(filteredTarget);
        this.camera.position.copy(filteredPos);
        this.camera.lookAt(filteredTarget);
        
        // 收敛判定：位置和目标都足够接近则停止
        const posDist = filteredPos.distanceTo(this._camTransition.targetPos);
        const tgtDist = filteredTarget.distanceTo(this._camTransition.targetLookAt);
        if (posDist < 0.01 && tgtDist < 0.01) {
            this.controls.target.copy(this._camTransition.targetLookAt);
            this.camera.position.copy(this._camTransition.targetPos);
            this._camTransition = null;
            // 过渡结束，恢复 OrbitControls
            if (this.controls) this.controls.enabled = true;
        }
    }
    
    /**
     * 计算从 centerIndex 到最远有效点的距离
     */
    _computeMaxRadius(centerIndex) {
        const c = this.points.userData.pointsData[centerIndex];
        let maxDist = 0;
        this.points.userData.pointsData.forEach((p, i) => {
            if (i === centerIndex) return;
            if (this._filteredIndices && !this._filteredIndices.has(i)) return;
            const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > maxDist) maxDist = d;
        });
        return maxDist || 1;
    }

    findNeighbors(centerIndex, radius) {
        const centerPoint = this.points.userData.pointsData[centerIndex];
        const neighbors = [centerIndex];
        
        this.points.userData.pointsData.forEach((p, i) => {
            if (i === centerIndex) return;
            // 过滤器激活时，只在过滤后的点集中查找邻居
            if (this._filteredIndices && !this._filteredIndices.has(i)) return;
            
            const dx = p.x - centerPoint.x;
            const dy = p.y - centerPoint.y;
            const dz = p.z - centerPoint.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance <= radius) {
                neighbors.push(i);
            }
        });
        
        return neighbors;
    }
    
    updateSelectionImages(neighborIndices) {
        const imagesContainer = document.getElementById('card-images');
        if (!imagesContainer) return;
        
        // 清理旧的 observer
        if (this._imageObserver) {
            this._imageObserver.disconnect();
        }
        
        imagesContainer.innerHTML = '';
        
        neighborIndices.forEach(idx => {
            const p = this.points.userData.pointsData[idx];
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'neighbor-image-wrapper';
            
            // 懒加载：先不设 src，用 data-src 暂存
            const img = document.createElement('img');
            img.dataset.src = '/api/image?path=' + encodeURIComponent(p.image_path);
            img.alt = `Image ${p.original_index}`;
            img.title = p.image_path;
            img.onerror = () => {
                imgWrapper.style.background = '#333';
                imgWrapper.textContent = `点 ${p.original_index}`;
            };
            
            imgWrapper.appendChild(img);
            imagesContainer.appendChild(imgWrapper);
        });
        
        // 用 IntersectionObserver 按需加载可见区域的图片
        this._imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        delete img.dataset.src;
                        this._imageObserver.unobserve(img);
                    }
                }
            });
        }, {
            root: imagesContainer,    // 以滚动容器为视口
            rootMargin: '0px 300px',  // 提前 300px 预加载
            threshold: 0
        });
        
        imagesContainer.querySelectorAll('img[data-src]').forEach(img => {
            this._imageObserver.observe(img);
        });
    }
    
    updatePointColors(neighborIndices) {
        const neighborSet = new Set(neighborIndices);
        const colors = this.points.geometry.attributes.color;
        const originalColors = this.points.userData.originalColors;
        
        for (let i = 0; i < colors.count; i++) {
            if (neighborSet.has(i)) {
                // 邻居点：显示原色
                colors.setXYZ(i, 
                    originalColors[i * 3],
                    originalColors[i * 3 + 1],
                    originalColors[i * 3 + 2]
                );
            } else if (this._filteredIndices && !this._filteredIndices.has(i)) {
                // 被过滤掉的点：近黑色，不可交互
                colors.setXYZ(i, 0.08, 0.08, 0.08);
            } else {
                // 过滤集内但非邻居：灰色
                colors.setXYZ(i, 0.3, 0.3, 0.3);
            }
        }
        
        colors.needsUpdate = true;
    }
    
    deselectPoint() {
        this.selectedPointIndex = null;
        this._hideRadiusSphere();
        
        // 断开懒加载 observer
        if (this._imageObserver) {
            this._imageObserver.disconnect();
            this._imageObserver = null;
        }
        
        // 恢复占位符
        const imagesContainer = document.getElementById('card-images');
        if (imagesContainer) {
            imagesContainer.innerHTML = '<span class="card-placeholder">点击 🔍 启用采点工具，再点击点云采点</span>';
        }
        
        // 相机回到全局视角
        this._flyToOverview();
        
        // 恢复点颜色：如果过滤器激活，恢复到过滤状态；否则恢复全部原色
        if (this.points && this.points.userData.originalColors) {
            if (this._filteredIndices) {
                this._applyFilterToPointCloud();
            } else {
                const colors = this.points.geometry.attributes.color;
                const originalColors = this.points.userData.originalColors;
                
                for (let i = 0; i < colors.count; i++) {
                    colors.setXYZ(i, 
                        originalColors[i * 3],
                        originalColors[i * 3 + 1],
                        originalColors[i * 3 + 2]
                    );
                }
                colors.needsUpdate = true;
            }
        }
    }
    
    addLog(message, type = 'info') {
        const logContent = document.getElementById('log-content');
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        line.textContent = `[${timestamp}] ${message}`;
        
        logContent.appendChild(line);
        
        if (this.logAutoScroll) {
            logContent.scrollTop = logContent.scrollHeight;
        }
    }
    
    clearLog() {
        const logContent = document.getElementById('log-content');
        logContent.innerHTML = '';
    }
    
    startLogPolling(outputFilename = null) {
        if (this.logInterval) {
            clearInterval(this.logInterval);
        }
        
        this.logInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/log');
                const result = await response.json();
                
                if (result.logs && result.logs.length > 0) {
                    result.logs.forEach(log => {
                        let type = 'info';
                        if (log.includes('✅') || log.includes('完成')) type = 'success';
                        else if (log.includes('❌') || log.includes('错误') || log.includes('Error')) type = 'error';
                        else if (log.includes('⚠️') || log.includes('Warning')) type = 'warning';
                        else if (log.includes('步骤') || log.includes('=')) type = 'highlight';
                        
                        this.addLog(log, type);
                    });
                }
                
                if (result.completed) {
                    clearInterval(this.logInterval);
                    this.addLog('🎉 处理完成！正在加载可视化...', 'success');
                    setTimeout(() => {
                        if (outputFilename) {
                            this.loadDataByFilename(outputFilename);
                        } else {
                            this.loadExistingData();
                        }
                    }, 1500);
                }
            } catch (error) {
                console.error('日志轮询失败:', error);
            }
        }, 1000);
    }
    
    stopLogPolling() {
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }
    
    showStatus(message, type = '') {
        const statusMsg = document.getElementById('status-msg');
        statusMsg.textContent = message;
        statusMsg.className = type;
    }
    
    setProcessing(isProcessing) {
        const processing = document.getElementById('processing');
        const btnLoad = document.getElementById('btn-load');
        const processingText = document.getElementById('processing-text');
        
        if (isProcessing) {
            processing.style.display = 'block';
            btnLoad.disabled = true;
            processingText.textContent = '处理中，请稍候...（约 10-20 分钟）';
        } else {
            processing.style.display = 'none';
            btnLoad.disabled = false;
        }
    }
    
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0f);
        
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 50);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = this.rotateSpeed;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(50, 50, 50);
        this.scene.add(pointLight);
        
        window.addEventListener('resize', () => this.onResize());
        
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        this.animate();
    }
    
    async loadExistingData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('没有现有数据');
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            document.getElementById('loading').style.display = 'none';
            this.addLog('✅ 已加载现有数据', 'success');
            this._loadFilters();
            
        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            this.addLog('📁 未找到现有数据，请选择数据集或上传文件', 'info');
        }
    }
    
    async loadDataByFilename(filename) {
        try {
            const response = await fetch(`/api/data?file=${encodeURIComponent(filename)}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '数据加载失败');
            }
            
            if (this.points) {
                this.scene.remove(this.points);
                this.points = null;
            }
            
            this.data = await response.json();
            
            if (!this.data || !this.data.points) {
                throw new Error('数据格式错误');
            }
            
            this.createPointCloud();
            this.updateStats();
            this.addLog('✅ 数据加载完成：' + filename, 'success');
            this._loadFilters();
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.addLog('❌ 数据加载失败：' + error.message, 'error');
        }
    }
    
    async loadData() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error('数据加载失败');
            }
            
            if (this.points) {
                this.scene.remove(this.points);
            }
            
            this.data = await response.json();
            this.createPointCloud();
            this.updateStats();
            this.addLog('✅ 新数据加载完成', 'success');
            this._loadFilters();
            
        } catch (error) {
            console.error('加载数据失败:', error);
            this.addLog('❌ 数据加载失败：' + error.message, 'error');
        }
    }
    
    _createCircleTexture(size = 64) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const half = size / 2;
        const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0.0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.7, 'rgba(255,255,255,1)');
        grad.addColorStop(1.0, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    createPointCloud() {
        const circleMap = this._createCircleTexture();
        const points = this.data.points;
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
            size: this.pointSize,
            vertexColors: true,
            transparent: true,
            opacity: this.pointOpacity,
            sizeAttenuation: false,
            map: circleMap,
            alphaTest: 0.1
        });
        
        this.points = new THREE.Points(geometry, material);
        this.points.userData = {
            pointsData: points,
            originalColors: colors.slice()
        };
        this.scene.add(this.points);
        
        // 高亮点缓冲区（最多 2 个点：slot0=悬浮, slot1=右键钉住）
        if (this._highlightPoint) {
            this.scene.remove(this._highlightPoint);
        }
        const HL_MAX = 2;
        const hlGeometry = new THREE.BufferGeometry();
        hlGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HL_MAX * 3), 3));
        hlGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(HL_MAX * 3), 3));
        hlGeometry.setDrawRange(0, 0);
        const hlMaterial = new THREE.PointsMaterial({
            size: this.pointSize * this.hoverScale,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: false,
            depthTest: false,
            map: circleMap,
            alphaTest: 0.1
        });
        this._highlightPoint = new THREE.Points(hlGeometry, hlMaterial);
        this._highlightPoint.renderOrder = 999;
        this._hlHoverIdx = -1;
        this._hlPinnedIdx = -1;
        this.scene.add(this._highlightPoint);
        
        // 选择半径指示球体（灰色虚线）
        if (this._radiusSphere) {
            this.scene.remove(this._radiusSphere);
        }
        const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
        const wireGeo = new THREE.EdgesGeometry(sphereGeo);
        const sphereMat = new THREE.LineDashedMaterial({
            color: 0x888888,
            dashSize: 0.3,
            gapSize: 0.15,
            transparent: true,
            opacity: 0.5,
            depthTest: true
        });
        this._radiusSphere = new THREE.LineSegments(wireGeo, sphereMat);
        this._radiusSphere.visible = false;
        this._radiusSphere.computeLineDistances();
        this.scene.add(this._radiusSphere);
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;
        
        this.points.position.set(-centerX, -centerY, -centerZ);
        this._highlightPoint.position.set(-centerX, -centerY, -centerZ);
        
        const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        this.camera.position.set(centerX, centerY, centerZ + maxDim * 1.5);
        this.controls.target.set(centerX, centerY, centerZ);
    }
    
    updateStats() {
        const meta = this.data.metadata;
        document.getElementById('stat-points').textContent = meta.n_points.toLocaleString();
        document.getElementById('stat-dim').textContent = meta.feature_dim;
        document.getElementById('stat-model').textContent = meta.model_version;
        document.getElementById('stat-neighbors').textContent = meta.umap_params.n_neighbors;
    }
    
    onMouseMove(event) {
        if (!this.points || !this._highlightPoint) return;
        
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.params.Points.threshold = 0.5;
        
        const intersects = this.raycaster.intersectObject(this.points);
        const hitIndex = this._pickClosestToRay(intersects);
        
        if (hitIndex >= 0 && hitIndex !== this._hlPinnedIdx) {
            this._hlHoverIdx = hitIndex;
        } else if (hitIndex < 0) {
            this._hlHoverIdx = -1;
        } else {
            // hitIndex === _hlPinnedIdx，钉住的点不重复显示在悬浮槽
            this._hlHoverIdx = -1;
        }
        this._syncHighlightBuffer();
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // 相机平滑过渡
        this._updateCameraTransition();
        
        if (this.controls) {
            this.controls.autoRotate = this.autoRotate;
            this.controls.update();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    toggleRotate() {
        this.autoRotate = !this.autoRotate;
        document.getElementById('btn-rotate').classList.toggle('active', this.autoRotate);
    }
    
    resetView() {
        // 中断任何正在进行的相机过渡
        this._camTransition = null;
        this._savedCamState = null;
        if (this.controls) this.controls.enabled = true;
        
        this.camera.position.set(0, 0, 50);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
    
    takeScreenshot(includeUI = false) {
        const filename = `screenshot_${new Date().getTime()}.png`;

        if (!includeUI) {
            // 仅 3D 画布
            this.renderer.render(this.scene, this.camera);
            const dataURL = this.renderer.domElement.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = filename;
            link.href = dataURL;
            link.click();
            return;
        }

        // 包含 UI 面板：先隐藏截图卡片自身，避免拍到它
        const screenshotCard = document.getElementById('screenshot-card');
        const fab = document.getElementById('controls-fab');
        const wasCardVisible = screenshotCard && screenshotCard.classList.contains('visible');
        const wasFabVisible = fab ? fab.style.display : '';
        if (screenshotCard) screenshotCard.style.display = 'none';
        if (fab) fab.style.display = 'none';

        // 确保 WebGL canvas 是最新一帧
        this.renderer.render(this.scene, this.camera);

        html2canvas(document.body, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: null,
            scale: window.devicePixelRatio || 1
        }).then(canvas => {
            // 恢复被隐藏的元素
            if (screenshotCard && wasCardVisible) screenshotCard.style.display = '';
            if (fab) fab.style.display = wasFabVisible;

            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(() => {
            if (screenshotCard && wasCardVisible) screenshotCard.style.display = '';
            if (fab) fab.style.display = wasFabVisible;
        });
    }

    async startRecording(includeUI = false) {
        if (this._isRecording) return;

        const btn = document.getElementById('btn-record');
        let stream;

        if (includeUI) {
            // 创建离屏合成 canvas（WebGL 画布 + 面板叠加）
            const compCanvas = document.createElement('canvas');
            compCanvas.width = window.innerWidth * (window.devicePixelRatio || 1);
            compCanvas.height = window.innerHeight * (window.devicePixelRatio || 1);
            const compCtx = compCanvas.getContext('2d');
            this._compCanvas = compCanvas;
            this._compCtx = compCtx;

            // 逐个捕获可见面板，合成到一张透明画布上
            const dpr = window.devicePixelRatio || 1;

            const capturePanels = async () => {
                const snapCanvas = document.createElement('canvas');
                snapCanvas.width = window.innerWidth * dpr;
                snapCanvas.height = window.innerHeight * dpr;
                const snapCtx = snapCanvas.getContext('2d');

                const panels = document.querySelectorAll('.draggable-panel, #image-preview-popup.visible, #selection-card');
                for (const panel of panels) {
                    if (panel.id === 'screenshot-card') continue;
                    if (!panel.offsetWidth || !panel.offsetHeight) continue;
                    if (panel.classList.contains('hidden-to-fab')) continue;
                    if (panel.style.display === 'none') continue;

                    const rect = panel.getBoundingClientRect();
                    try {
                        const c = await html2canvas(panel, {
                            backgroundColor: null,
                            scale: dpr,
                            useCORS: true,
                            allowTaint: true,
                        });
                        snapCtx.drawImage(c,
                            rect.left * dpr, rect.top * dpr,
                            rect.width * dpr, rect.height * dpr);
                    } catch { /* skip this panel */ }
                }
                return snapCanvas;
            };

            this._panelSnapshot = await capturePanels();

            // 定时刷新面板快照（每 2 秒）
            this._snapshotTimer = setInterval(async () => {
                if (!this._isRecording) return;
                try { this._panelSnapshot = await capturePanels(); } catch { /* ignore */ }
            }, 2000);

            // 合成循环：每帧把 WebGL + 面板快照画到 compCanvas
            const drawComposite = () => {
                if (!this._isRecording) return;
                const dpr = window.devicePixelRatio || 1;
                const w = window.innerWidth * dpr;
                const h = window.innerHeight * dpr;
                if (compCanvas.width !== w || compCanvas.height !== h) {
                    compCanvas.width = w;
                    compCanvas.height = h;
                }
                compCtx.clearRect(0, 0, w, h);
                // 画 WebGL 画布（拉伸到全屏）
                compCtx.drawImage(this.renderer.domElement, 0, 0, w, h);
                // 叠加面板快照
                if (this._panelSnapshot) {
                    compCtx.drawImage(this._panelSnapshot, 0, 0, w, h);
                }
                requestAnimationFrame(drawComposite);
            };
            requestAnimationFrame(drawComposite);

            stream = compCanvas.captureStream(30);
        } else {
            // 仅 3D 画布
            stream = this.renderer.domElement.captureStream(30);
        }

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';
        const recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8_000_000
        });
        const chunks = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `recording_${new Date().getTime()}.webm`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            stream.getTracks().forEach(t => t.stop());
        };

        recorder.start();
        this._isRecording = true;
        this._mediaRecorder = recorder;

        btn.classList.add('recording');
        btn.textContent = '⏹ 停止录制';
    }

    stopRecording() {
        if (!this._isRecording || !this._mediaRecorder) return;

        this._mediaRecorder.stop();
        this._isRecording = false;
        this._mediaRecorder = null;

        // 清理合成资源
        if (this._snapshotTimer) {
            clearInterval(this._snapshotTimer);
            this._snapshotTimer = null;
        }
        this._compCanvas = null;
        this._compCtx = null;
        this._panelSnapshot = null;

        const btn = document.getElementById('btn-record');
        btn.classList.remove('recording');
        btn.textContent = '⏺ 录像';
    }
}

// 初始化查看器
let viewer = null;

document.addEventListener('DOMContentLoaded', () => {
    viewer = new Viewer3D();
    
    document.getElementById('btn-rotate').addEventListener('click', () => {
        viewer.toggleRotate();
    });
    
    document.getElementById('btn-reset').addEventListener('click', () => {
        viewer.resetView();
    });
    
    document.getElementById('btn-screenshot').addEventListener('click', () => {
        const card = document.getElementById('screenshot-card');
        if (card) {
            const isVisible = card.classList.contains('visible');
            // 关闭设置弹窗（如果打开了）
            const settingsOv = document.getElementById('settings-overlay');
            if (settingsOv) settingsOv.classList.remove('open');
            // Toggle 截图卡片
            if (isVisible) {
                card.classList.remove('visible');
            } else {
                card.classList.add('visible');
            }
        }
    });
    
    // ---- 右键图片预览 ----
    const previewPopup = document.getElementById('image-preview-popup');
    const previewToolbar = previewPopup.querySelector('.preview-toolbar');
    const fullscreenOverlay = document.getElementById('image-fullscreen-overlay');
    const fullscreenImg = document.getElementById('fullscreen-img');

    // 拖动预览弹窗
    let previewDrag = null;
    previewToolbar.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        const rect = previewPopup.getBoundingClientRect();
        previewDrag = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: rect.left,
            origTop: rect.top
        };
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!previewDrag) return;
        const dx = e.clientX - previewDrag.startX;
        const dy = e.clientY - previewDrag.startY;
        previewPopup.style.left = (previewDrag.origLeft + dx) + 'px';
        previewPopup.style.top = (previewDrag.origTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (previewDrag) {
            previewDrag = null;
            document.body.style.cursor = 'default';
        }
    });

    document.getElementById('btn-preview-close').addEventListener('click', () => {
        viewer._closeImagePreview();
    });

    document.getElementById('btn-preview-fullscreen').addEventListener('click', () => {
        const src = document.getElementById('preview-img').src;
        if (!src) return;
        fullscreenImg.src = src;
        fullscreenOverlay.classList.add('open');
        viewer._closeImagePreview();
    });

    fullscreenOverlay.addEventListener('click', () => {
        fullscreenOverlay.classList.remove('open');
    });

    // 点击弹窗外部关闭（排除拖动操作）
    document.addEventListener('pointerdown', (e) => {
        if (previewDrag) return;
        if (previewPopup.classList.contains('visible') && !previewPopup.contains(e.target)) {
            viewer._closeImagePreview();
        }
    });

    // Escape 关闭全屏或预览
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (fullscreenOverlay.classList.contains('open')) {
                fullscreenOverlay.classList.remove('open');
            } else if (previewPopup.classList.contains('visible')) {
                viewer._closeImagePreview();
            }
        }
    });
    
    // ---- 设置弹窗 ----
    const settingsOverlay = document.getElementById('settings-overlay');
    const btnSettings = document.getElementById('btn-settings');
    const btnSettingsClose = document.getElementById('btn-settings-close');

    const openSettings = () => {
        // 同步当前值到滑条
        const sliders = {
            'set-point-size':    { val: viewer.pointSize },
            'set-opacity':       { val: viewer.pointOpacity },
            'set-hover-scale':   { val: viewer.hoverScale },
            'set-rotate-speed':  { val: viewer.rotateSpeed },
            'set-cam-smooth':    { val: viewer.camSmooth },
        };
        for (const [id, cfg] of Object.entries(sliders)) {
            const el = document.getElementById(id);
            if (el) {
                el.value = cfg.val;
                document.getElementById(id + '-val').textContent = cfg.val;
            }
        }
        settingsOverlay.classList.add('open');
    };

    const closeSettings = () => settingsOverlay.classList.remove('open');

    btnSettings.addEventListener('click', openSettings);
    btnSettingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) closeSettings();
    });

    // 通用滑条绑定：实时更新参数
    const bindSlider = (sliderId, apply) => {
        const slider = document.getElementById(sliderId);
        const valEl = document.getElementById(sliderId + '-val');
        if (!slider) return;
        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            valEl.textContent = v;
            apply(v);
        });
    };

    bindSlider('set-point-size', (v) => {
        viewer.pointSize = v;
        if (viewer.points) viewer.points.material.size = v;
        if (viewer._highlightPoint) viewer._highlightPoint.material.size = v * viewer.hoverScale;
    });

    bindSlider('set-opacity', (v) => {
        viewer.pointOpacity = v;
        if (viewer.points) viewer.points.material.opacity = v;
    });

    bindSlider('set-hover-scale', (v) => {
        viewer.hoverScale = v;
        if (viewer._highlightPoint) viewer._highlightPoint.material.size = viewer.pointSize * v;
    });

    bindSlider('set-rotate-speed', (v) => {
        viewer.rotateSpeed = v;
        if (viewer.controls) viewer.controls.autoRotateSpeed = v;
    });

    bindSlider('set-cam-smooth', (v) => {
        viewer.camSmooth = v;
        // 更新所有子滤波器的 minCutoff
        for (const f of [viewer._camTargetFilter, viewer._camPosFilter]) {
            f._fx._minCutoff = v;
            f._fy._minCutoff = v;
            f._fz._minCutoff = v;
        }
    });
    
    // ---- 悬浮工具球（可拖动 + 边缘吸附） ----
    const fab = document.getElementById('controls-fab');
    const fabToggle = document.getElementById('fab-toggle');
    let fabTimer = null;
    let fabDragState = null; // { startX, startY, fabStartLeft, fabStartTop }
    let fabDidDrag = false;
    const FAB_SIZE = 48;

    // 初始位置：右下角
    const initFabPos = () => {
        fab.style.left = (window.innerWidth - FAB_SIZE - 24) + 'px';
        fab.style.top = (window.innerHeight - FAB_SIZE - 24) + 'px';
        fab.dataset.edge = 'right';
    };
    initFabPos();

    const collapseFab = () => {
        fab.classList.remove('expanded');
        fab.classList.add('collapsed');
    };

    const resetFabTimer = () => {
        if (fabTimer) clearTimeout(fabTimer);
        fabTimer = setTimeout(collapseFab, 4000);
    };

    // 吸附到最近边缘
    const snapToEdge = () => {
        const rect = fab.getBoundingClientRect();
        const cx = rect.left + FAB_SIZE / 2;
        const cy = rect.top + FAB_SIZE / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const distances = [
            { edge: 'left',   x: 0,              y: cy,             dist: cx },
            { edge: 'right',  x: vw - FAB_SIZE,  y: cy,             dist: vw - cx },
            { edge: 'top',    x: cx,              y: 0,              dist: cy },
            { edge: 'bottom', x: cx,              y: vh - FAB_SIZE,  dist: vh - cy },
        ];

        // 修正坐标：边缘位置要以 left/top 表示
        distances[0].x = 0;
        distances[0].y = cy - FAB_SIZE / 2;
        distances[1].x = vw - FAB_SIZE;
        distances[1].y = cy - FAB_SIZE / 2;
        distances[2].x = cx - FAB_SIZE / 2;
        distances[2].y = 0;
        distances[3].x = cx - FAB_SIZE / 2;
        distances[3].y = vh - FAB_SIZE;

        const nearest = distances.reduce((a, b) => a.dist < b.dist ? a : b);
        
        // 限制在可视范围内
        const finalX = Math.max(0, Math.min(vw - FAB_SIZE, nearest.x));
        const finalY = Math.max(0, Math.min(vh - FAB_SIZE, nearest.y));

        fab.dataset.edge = nearest.edge;
        fab.style.left = finalX + 'px';
        fab.style.top = finalY + 'px';
    };

    // 拖动
    fabToggle.addEventListener('pointerdown', (e) => {
        fabDragState = {
            startX: e.clientX,
            startY: e.clientY,
            fabStartLeft: fab.offsetLeft,
            fabStartTop: fab.offsetTop
        };
        fabDidDrag = false;
        fab.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('pointermove', (e) => {
        if (!fabDragState) return;
        const dx = e.clientX - fabDragState.startX;
        const dy = e.clientY - fabDragState.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fabDidDrag = true;
        fab.style.left = (fabDragState.fabStartLeft + dx) + 'px';
        fab.style.top = (fabDragState.fabStartTop + dy) + 'px';
    });

    document.addEventListener('pointerup', () => {
        if (!fabDragState) return;
        fab.classList.remove('dragging');
        if (fabDidDrag) {
            snapToEdge();
            // 拖动结束后如果是折叠态就保持，展开态则重置计时
            if (fab.classList.contains('expanded')) resetFabTimer();
        }
        fabDragState = null;
    });

    // 点击（非拖动时）
    fabToggle.addEventListener('click', (e) => {
        if (fabDidDrag) return; // 拖动结束忽略此次 click
        const isExpanded = fab.classList.contains('expanded');
        if (isExpanded) {
            collapseFab();
            if (fabTimer) clearTimeout(fabTimer);
        } else {
            fab.classList.remove('collapsed');
            fab.classList.add('expanded');
            resetFabTimer();
        }
    });

    // 面板内按钮点击后重置计时器
    document.getElementById('fab-panel').addEventListener('click', () => {
        resetFabTimer();
    });

    // 窗口缩放时重新吸附
    window.addEventListener('resize', () => { snapToEdge(); });
});
