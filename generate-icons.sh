#!/bin/bash

# 创建 icons 目录
mkdir -p src/icons

# 生成基础图标 (128x128)
convert -size 128x128 xc:none \
  -fill '#4285f4' -draw 'circle 64,64 64,0' \
  -fill white -draw 'rectangle 25,25 102,102' \
  -stroke '#4285f4' -strokewidth 6 \
  -draw 'line 38,64 58,45 77,77' \
  src/icons/icon128.png

# 生成其他尺寸
convert src/icons/icon128.png -resize 48x48 src/icons/icon48.png
convert src/icons/icon128.png -resize 32x32 src/icons/icon32.png
convert src/icons/icon128.png -resize 16x16 src/icons/icon16.png

echo "图标生成完成！" 