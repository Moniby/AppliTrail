targetScope = 'resourceGroup'

@minLength(3)
@maxLength(20)
param appName string = 'applitrail'

@allowed([
  'staging'
  'production'
])
param environmentName string

param location string = resourceGroup().location

var suffix = toLower(uniqueString(subscription().subscriptionId, resourceGroup().id, environmentName))
var safePrefix = toLower(replace('${appName}${environmentName}', '-', ''))
var registryName = take('${safePrefix}${suffix}', 50)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

output containerRegistryName string = registry.name
output containerRegistryLoginServer string = registry.properties.loginServer

