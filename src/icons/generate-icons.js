// 创建一个函数来生成并下载图标
function generateAndDownloadIcons() {
  const sizes = [16, 32, 48, 128];
  
  sizes.forEach(size => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    
    // 绘制圆形背景
    ctx.fillStyle = '#4285f4';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制浏览器框架
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(size*0.2, size*0.2, size*0.6, size*0.6);
    
    // 绘制图表线条
    ctx.strokeStyle = '#4285f4';
    ctx.lineWidth = Math.max(1, size*0.05);
    ctx.beginPath();
    ctx.moveTo(size*0.3, size*0.5);
    ctx.lineTo(size*0.45, size*0.35);
    ctx.lineTo(size*0.6, size*0.6);
    ctx.stroke();
    
    // 转换为 PNG 并下载
    const link = document.createElement('a');
    link.download = `icon${size}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

// 调用函数生成图标
generateAndDownloadIcons(); 