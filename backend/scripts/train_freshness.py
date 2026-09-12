"""
train_freshness.py — Train the Kisan360 crop-freshness grader and export to TF.js.

Dataset : Densu341/Fresh-rotten-fruit (HuggingFace, openrail license)
          Train: 23.6k images — 18 classes = 9 fruits (apples, banana, bittergroud,
          capsicum, cucumber, okra, oranges, potato, tomato) x {fresh, rotten}
          Test : 6.7k images, same classes (two folder typos normalized)
Model   : MobileNetV2 (ImageNet) + 18-class head
          Trained with tf_keras (Keras 2) so tfjs 3.18 can convert the SavedModel.
          Browser aggregates 18 probs -> fresh/rotten -> AGMARK visual grade.
Output  : web-app/public/models/crop-grader/{model.json, group1-shard*.bin, model-info.json}

Run (from repo root):
  .venv-ml/Scripts/python backend/scripts/train_freshness.py
"""
import json
import os
import shutil
import sys
import time

import setuptools  # noqa: F401 — must run first: activates the distutils shim so the tensorflowjs import chain works on Python 3.13+
import tensorflow as tf

SEED = 42
IMG = 224
BATCH = 32
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'ml-work')
ZIP = os.path.join(WORK, 'freshness_fruit.zip')
EXTRACT = os.path.join(WORK, 'extracted')
SAVED = os.path.join(WORK, 'saved_model')
CKPT = os.path.join(WORK, 'freshness.keras')
OUTDIR = os.path.normpath(os.path.join(HERE, '..', '..', 'web-app', 'public', 'models', 'crop-grader'))

# Test-set folder typos -> canonical class folder names
TEST_NAME_FIX = {'freshpatato': 'freshpotato', 'freshtamto': 'freshtomato',
                 'rottenpatato': 'rottenpotato', 'rottentamto': 'rottentomato'}


def train_classes():
    root = os.path.join(EXTRACT, 'dataset', 'Train')
    return sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)))


def list_images(split_dir, class_names):
    """Return (paths, class_idx) walking one split directory."""
    paths, idxs = [], []
    for folder in sorted(os.listdir(split_dir)):
        cname = TEST_NAME_FIX.get(folder, folder)
        if cname not in class_names:
            continue
        cidx = class_names.index(cname)
        cdir = os.path.join(split_dir, folder)
        for f in os.listdir(cdir):
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                paths.append(os.path.join(cdir, f))
                idxs.append(cidx)
    return paths, idxs


def make_ds(paths, idxs, shuffle, augment=False):
    ds = tf.data.Dataset.from_tensor_slices((paths, idxs))
    if shuffle:
        ds = ds.shuffle(len(paths), seed=SEED)

    def load(path, label):
        raw = tf.io.read_file(path)
        img = tf.io.decode_image(raw, channels=3, expand_animations=False)
        img = tf.image.resize(img, [IMG, IMG])
        return img, label

    def aug(img, label):
        img = tf.image.random_flip_left_right(img)
        img = tf.image.random_brightness(img, 0.08)
        img = tf.image.random_contrast(img, 0.9, 1.1)
        return img, label

    AUTOTUNE = tf.data.AUTOTUNE
    ds = ds.map(load, num_parallel_calls=AUTOTUNE)
    if augment:
        ds = ds.map(aug, num_parallel_calls=AUTOTUNE)
    return ds.batch(BATCH).prefetch(AUTOTUNE)


def build_model(n_classes):
    import tf_keras as keras
    base = keras.applications.MobileNetV2(
        input_shape=(IMG, IMG, 3), include_top=False, weights='imagenet')
    base.trainable = False
    inputs = keras.Input(shape=(IMG, IMG, 3))
    x = keras.applications.mobilenet_v2.preprocess_input(inputs)  # -> [-1, 1]
    x = base(x, training=False)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dropout(0.2)(x)
    outputs = keras.layers.Dense(n_classes, activation='softmax')(x)
    model = keras.Model(inputs, outputs)
    model.compile(optimizer=keras.optimizers.Adam(1e-3),
                  loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return model, base


def evaluate_binary(model, class_names):
    """Official Test split, aggregated to fresh/rotten — the farmer-facing metric."""
    test_dir = os.path.join(EXTRACT, 'dataset', 'Test')
    paths, idxs = list_images(test_dir, class_names)
    ds = make_ds(paths, idxs, shuffle=False)
    fine = correct = n = 0
    for imgs, labels in ds:
        probs = model.predict(imgs, verbose=0)
        pred = probs.argmax(axis=1)
        fine += int((pred == labels.numpy()).sum())
        p_fresh = probs[:, :len(class_names) // 2].sum(axis=1)
        p_rot = probs[:, len(class_names) // 2:].sum(axis=1)
        # fresh classes are the first half (alphabetical); binary compare
        bin_pred = (p_fresh >= p_rot).astype(int)
        bin_true = (labels.numpy() < len(class_names) // 2).astype(int)
        correct += int((bin_pred == bin_true).sum())
        n += len(pred)
    return round(fine / n * 100, 1), round(correct / n * 100, 1), n


def main():
    t0 = time.time()
    if not os.path.isdir(os.path.join(EXTRACT, 'dataset', 'Train')):
        if not os.path.exists(ZIP):
            print(f'FATAL: dataset zip missing at {ZIP}')
            sys.exit(1)
        print('[data] extracting zip (one-time) ...')
        shutil.unpack_archive(ZIP, EXTRACT)

    class_names = train_classes()
    n_fresh = sum(1 for c in class_names if c.startswith('fresh'))
    print(f'[data] {len(class_names)} classes ({n_fresh} fresh / {len(class_names) - n_fresh} rotten): {class_names}')

    train_paths, train_idxs = list_images(os.path.join(EXTRACT, 'dataset', 'Train'), class_names)
    print(f'[data] train pool: {len(train_paths)} images')

    # 85/15 train/val split
    ds_all = tf.data.Dataset.from_tensor_slices((train_paths, train_idxs))
    ds_all = ds_all.shuffle(len(train_paths), seed=SEED)
    val_n = max(1, int(0.15 * len(train_paths)))
    val_list = list(ds_all.take(val_n).as_numpy_iterator())
    train_list = list(ds_all.skip(val_n).as_numpy_iterator())
    vp = [v[0].decode() for v in val_list]; vi = [v[1] for v in val_list]
    tp = [v[0].decode() for v in train_list]; ti = [v[1] for v in train_list]
    print(f'[data] split: train={len(tp)} val={len(vp)}')
    train_ds = make_ds(tp, ti, shuffle=True, augment=True)
    val_ds = make_ds(vp, vi, shuffle=False)

    if not os.path.exists(CKPT):
        model, base = build_model(len(class_names))
        print('[train] Phase 1: frozen base, 3 epochs')
        model.fit(train_ds, validation_data=val_ds, epochs=3)
        print('[train] Phase 2: fine-tune last 30 base layers, 2 epochs @ lr=1e-5')
        base.trainable = True
        for layer in base.layers[:-30]:
            layer.trainable = False
        import tf_keras as keras
        model.compile(optimizer=keras.optimizers.Adam(1e-5),
                      loss='sparse_categorical_crossentropy', metrics=['accuracy'])
        model.fit(train_ds, validation_data=val_ds, epochs=2)
        model.save(CKPT)
        print('[train] checkpoint saved:', CKPT)

    import tf_keras as keras
    model = keras.models.load_model(CKPT)

    print('[eval] official Test split ...')
    fine_acc, bin_acc, n_test = evaluate_binary(model, class_names)
    print(f'[eval] fine 18-class acc={fine_acc}% | fresh/rotten acc={bin_acc}% (n={n_test})')

    print('[export] saving SavedModel and converting to TF.js ...')
    model.save(SAVED)
    from tensorflowjs.converters import convert_tf_saved_model
    os.makedirs(OUTDIR, exist_ok=True)
    convert_tf_saved_model(SAVED, OUTDIR)
    print('[export] files:', sorted(os.listdir(OUTDIR)))

    info = {
        'formats': ['tfjs-graph'],
        'model': 'mobilenetv2-freshness-grader',
        'version': '1.1.0',
        'trained': time.strftime('%Y-%m-%d'),
        'description': 'MobileNetV2 trained on ~23.6k fruit/vegetable freshness photos; 18-class head (9 fruits x fresh/rotten), aggregated to fresh/rotten in the browser and mapped to AGMARK visual grades',
        'trainedOn': ['Densu341/Fresh-rotten-fruit (HuggingFace, openrail) — apples, banana, bittergourd, capsicum, cucumber, okra, oranges, potato, tomato'],
        'crops': ['apple', 'banana', 'bittergourd', 'capsicum', 'cucumber', 'okra', 'orange', 'potato', 'tomato'],
        'classes': {
            'output': class_names,
            'aggregation': 'classes prefixed "fresh" vs "rotten"; browser sums softmax mass per group',
            'description': {
                'fresh': 'Grade I — premium visual quality, minimal visible damage',
                'rotten': 'Grade III — visible decay; complement with AGMARK questionnaire parameters',
            },
        },
        'inputShape': [IMG, IMG, 3],
        'preprocessing': 'resize 224x224, normalize to [-1, 1] (MobileNetV2 preprocess_input)',
        'testAccuracyPct': {'fine18': fine_acc, 'binaryFreshRotten': bin_acc, 'n': n_test},
        'modelUrl': '/models/crop-grader/model.json',
        'fallbackToRuleBased': True,
        'note': 'Trained locally with TensorFlow 2.20 (CPU). Photo ML covers produce freshness — its training domain; all crops also grade via the AGMARK questionnaire rule engine.',
    }
    with open(os.path.join(OUTDIR, 'model-info.json'), 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2)
    print(f'[done] total {time.time() - t0:.0f}s — TF.js model written to {OUTDIR}')


if __name__ == '__main__':
    main()
