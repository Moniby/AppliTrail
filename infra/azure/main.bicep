targetScope = 'resourceGroup'

@description('Short application name used to create globally unique Azure resource names.')
@minLength(3)
@maxLength(20)
param appName string = 'applitrail'

@description('Deployment environment. Staging and production are always separate.')
@allowed([
  'staging'
  'production'
])
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Immutable container image, preferably pinned by digest or Git revision.')
param containerImage string

@description('Whether the Container App accepts public traffic. Leave false until the trusted identity gateway is ready.')
param enableExternalIngress bool = false

@description('PostgreSQL administrator login.')
param postgresAdminLogin string = 'applitrailadmin'

@secure()
@description('URL-safe PostgreSQL administrator password supplied only by the deployment environment.')
param postgresAdminPassword string

@secure()
@description('OpenAI API key supplied only by the deployment environment.')
param openAiApiKey string

@secure()
@description('Stripe secret key supplied only by the deployment environment.')
param stripeSecretKey string

@secure()
@description('Stripe webhook signing secret supplied only by the deployment environment.')
param stripeWebhookSecret string

@secure()
@description('Private shared secret between the future identity gateway and AppliTrail.')
param authGatewaySecret string

@description('Public URL for the environment. Use the Container App URL until a custom domain is configured.')
param publicUrl string = ''

@description('Administrator bootstrap email. Replace with an immutable identity ID after first sign-in.')
param adminEmail string = ''

@description('Stripe mode for this environment.')
@allowed([
  'test'
  'live'
])
param stripeEnvironment string = environmentName == 'production' ? 'live' : 'test'

@description('Stripe product and recurring price identifiers. Configure these per GitHub environment before activation.')
param stripeProductBasic string = ''
param stripeProductStandard string = ''
param stripePriceBasicMonthly string = ''
param stripePriceBasicQuarterly string = ''
param stripePriceBasicSixMonth string = ''
param stripePriceBasicAnnual string = ''
param stripePriceStandardMonthly string = ''
param stripePriceStandardQuarterly string = ''
param stripePriceStandardSixMonth string = ''
param stripePriceStandardAnnual string = ''
param stripePriceExtraCredit string = ''

@description('Enable production zone-redundant PostgreSQL only after confirming regional capacity and cost.')
param productionHighAvailability bool = false

@description('Enable production geo-redundant PostgreSQL backups only after confirming the paired-region design and cost.')
param productionGeoRedundantBackup bool = false

var suffix = toLower(uniqueString(subscription().subscriptionId, resourceGroup().id, environmentName))
var safePrefix = toLower(replace('${appName}${environmentName}', '-', ''))
var registryName = take('${safePrefix}${suffix}', 50)
var storageName = take('${safePrefix}${suffix}', 24)
var keyVaultName = take('${appName}-${environmentName}-${suffix}', 24)
var identityName = '${appName}-${environmentName}-identity'
var logName = '${appName}-${environmentName}-logs'
var insightsName = '${appName}-${environmentName}-insights'
var managedEnvironmentName = '${appName}-${environmentName}-environment'
var postgresName = take('${appName}-${environmentName}-${suffix}', 63)
var containerAppName = '${appName}-${environmentName}'
var databaseName = 'applitrail'
var blobContainerName = 'resumes'
var databaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresName}.postgres.database.azure.com:5432/${databaseName}?sslmode=require'
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
var minReplicas = environmentName == 'production' ? 1 : 0
var maxReplicas = environmentName == 'production' ? 5 : 2

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

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

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: environmentName == 'production' ? 30 : 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: environmentName == 'production' ? 30 : 7
    }
  }
}

resource resumes 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: blobContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresName
  location: location
  sku: {
    name: environmentName == 'production' ? 'Standard_D2ds_v5' : 'Standard_B1ms'
    tier: environmentName == 'production' ? 'GeneralPurpose' : 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: environmentName == 'production' ? 14 : 7
      geoRedundantBackup: environmentName == 'production' && productionGeoRedundantBackup ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: environmentName == 'production' && productionHighAvailability ? 'ZoneRedundant' : 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logName
  location: location
  properties: {
    retentionInDays: environmentName == 'production' ? 30 : 14
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: environmentName == 'production'
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: databaseUrl
  }
}

resource storageSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-storage-connection-string'
  properties: {
    value: storageConnectionString
  }
}

resource openAiSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'openai-api-key'
  properties: {
    value: openAiApiKey
  }
}

resource stripeSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'stripe-secret-key'
  properties: {
    value: stripeSecretKey
  }
}

resource stripeWebhook 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'stripe-webhook-secret'
  properties: {
    value: stripeWebhookSecret
  }
}
resource gatewaySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'auth-gateway-secret'
  properties: {
    value: authGatewaySecret
  }
}

resource keyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, identity.id, 'key-vault-secrets-user')
  scope: keyVault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'acr-pull')
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: managedEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: enableExternalIngress
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${databaseUrlSecret.name}'
          identity: identity.id
        }
        {
          name: 'storage-connection-string'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${storageSecret.name}'
          identity: identity.id
        }
        {
          name: 'openai-api-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${openAiSecret.name}'
          identity: identity.id
        }
        {
          name: 'stripe-secret-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${stripeSecret.name}'
          identity: identity.id
        }
        {
          name: 'stripe-webhook-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${stripeWebhook.name}'
          identity: identity.id
        }
        {
          name: 'auth-gateway-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/${gatewaySecret.name}'
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'applitrail'
          image: containerImage
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'APPLITRAIL_ENVIRONMENT', value: environmentName }
            { name: 'APPLITRAIL_RELEASE', value: containerImage }
            { name: 'APPLITRAIL_PUBLIC_URL', value: publicUrl }
            { name: 'APPLITRAIL_DATABASE_PROVIDER', value: 'postgres' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'APPLITRAIL_DATABASE_SSL', value: 'require' }
            { name: 'APPLITRAIL_STORAGE_PROVIDER', value: 'azure' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-connection-string' }
            { name: 'AZURE_STORAGE_CONTAINER', value: blobContainerName }
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'STRIPE_ENVIRONMENT', value: stripeEnvironment }
            { name: 'APPLIFLOW_PAYMENT_MODE', value: 'stripe' }
            { name: 'STRIPE_SECRET_KEY', secretRef: 'stripe-secret-key' }
            { name: 'STRIPE_WEBHOOK_SECRET', secretRef: 'stripe-webhook-secret' }
            { name: 'STRIPE_AUTOMATIC_TAX', value: 'true' }
            { name: 'STRIPE_PRODUCT_BASIC', value: stripeProductBasic }
            { name: 'STRIPE_PRODUCT_STANDARD', value: stripeProductStandard }
            { name: 'STRIPE_PRICE_BASIC_MONTHLY', value: stripePriceBasicMonthly }
            { name: 'STRIPE_PRICE_BASIC_QUARTERLY', value: stripePriceBasicQuarterly }
            { name: 'STRIPE_PRICE_BASIC_SIX_MONTH', value: stripePriceBasicSixMonth }
            { name: 'STRIPE_PRICE_BASIC_ANNUAL', value: stripePriceBasicAnnual }
            { name: 'STRIPE_PRICE_STANDARD_MONTHLY', value: stripePriceStandardMonthly }
            { name: 'STRIPE_PRICE_STANDARD_QUARTERLY', value: stripePriceStandardQuarterly }
            { name: 'STRIPE_PRICE_STANDARD_SIX_MONTH', value: stripePriceStandardSixMonth }
            { name: 'STRIPE_PRICE_STANDARD_ANNUAL', value: stripePriceStandardAnnual }
            { name: 'STRIPE_PRICE_EXTRA_CREDIT', value: stripePriceExtraCredit }
            { name: 'APPLITRAIL_AUTH_MODE', value: 'gateway' }
            { name: 'APPLITRAIL_AUTH_GATEWAY_SECRET', secretRef: 'auth-gateway-secret' }
            { name: 'APPLIFLOW_ADMIN_EMAIL', value: adminEmail }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              timeoutSeconds: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/ready'
                port: 3000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  tags: {
    application: appName
    environment: environmentName
    managedBy: 'bicep'
  }
  dependsOn: [
    acrPull
    keyVaultSecretsUser
    resumes
    database
    allowAzureServices
  ]
}

output containerRegistryName string = registry.name
output containerRegistryLoginServer string = registry.properties.loginServer
output containerAppName string = app.name
output containerAppFqdn string = app.properties.configuration.ingress.fqdn
output keyVaultName string = keyVault.name
output postgresServerName string = postgres.name
output storageAccountName string = storage.name
