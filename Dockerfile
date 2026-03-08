FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código fuente
COPY . .

# Construir la aplicación frontend
RUN npm run build

# Exponer el puerto que usa la aplicación
EXPOSE 5037

# Comando para iniciar la aplicación
CMD ["npm", "start"]
