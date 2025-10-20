import numpy as np

np.random.seed(0)

n_samples = 100_000
n_features = 1024

print('CREATE TABLE vectors (id TEXT, embedding FLOAT32(1024));')
for i in range(n_samples):
    v = np.random.rand(n_features).astype(np.float32)
    print(f"INSERT INTO vectors VALUES ('{i}', vector32('{v.tolist()}'));")


