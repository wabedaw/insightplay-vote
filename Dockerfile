# insightPLAY 票选站 —— 单进程 Express，无数据库、无原生依赖。
# 票存在 /data 的 JSON 文件里（Fly volume），镜像本身完全无状态。
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# 先装依赖，改内容时这一层还能命中缓存
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# 数据目录：正常情况下会被 Fly volume 挂载盖掉；
# 这里先建好，是为了没挂盘时也能起得来（本地 docker run 调试）
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV PORT=8080 DATA_DIR=/data
EXPOSE 8080

CMD ["node", "server.js"]
