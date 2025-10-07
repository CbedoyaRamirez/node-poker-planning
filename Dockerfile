# Usa una imagen base oficial de Node.js
# 'alpine' es una versión ligera de Linux, ideal para contenedores pequeños
FROM node:18-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos package.json y package-lock.json
# Esto permite que Docker use el cache de capas si los dependencies no cambian
COPY package*.json ./

# Instala las dependencias del proyecto
# '--omit=dev' asegura que las dependencias de desarrollo no se instalen en el contenedor de producción
RUN npm install --omit=dev

# Copia el resto del código de tu aplicación al directorio de trabajo
# '.dockerignore' es crucial aquí para excluir archivos innecesarios
COPY . .

# Expone el puerto en el que tu aplicación Node.js escuchará.
# Tu aplicación Node.js DEBE escuchar en este puerto, o en el puerto definido por la variable de entorno PORT.
# En Azure App Service/Container Apps, la variable PORT ya se establece automáticamente.
EXPOSE 3000

# Comando para ejecutar la aplicación cuando el contenedor se inicie
# 'node server.js' asume que tu script principal es server.js
CMD [ "node", "server.js" ]