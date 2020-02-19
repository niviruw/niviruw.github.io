#include "StickerSheet.h"
#include "Image.h"
#include <iostream>
#include <algorithm>

using namespace cs225;

StickerSheet::StickerSheet(const Image &picture, unsigned max)
{
    max_ = max;
    base_picture = new Image(picture);
    num_stickers = 0;

    stickers_ = new Image *[max_];
    x_ = new unsigned[max_];
    y_ = new unsigned[max_];

    for (unsigned i = 0; i < max; i++)
    {
        stickers_[i] = NULL;
        x_[i] = 0;
        y_[i] = 0;
    }
}

void StickerSheet::clear()
{
    for (unsigned i = 0; i < num_stickers; i++)
    {
        delete stickers_[i];
        stickers_[i] = NULL;
    }
    delete[] stickers_;
    stickers_ = NULL;
    delete[] x_;
    x_ = NULL;
    delete[] y_;
    y_ = NULL;
    delete base_picture;
    base_picture = NULL;
}

StickerSheet::~StickerSheet()
{
    clear();
}

void StickerSheet::copy(const StickerSheet &other)
{
    max_ = other.max_;
    base_picture = new Image(*(other.base_picture));
    num_stickers = other.num_stickers;

    stickers_ = new Image *[max_];
    x_ = new unsigned[max_];
    y_ = new unsigned[max_];

    for (unsigned i = 0; i < max_; i++)
    {
        stickers_[i] = NULL;
        x_[i] = 0;
        y_[i] = 0;
    }

    for (unsigned i = 0; i < num_stickers; i++)
    {
        stickers_[i] = new Image(*(other.stickers_[i]));
        x_[i] = other.x_[i];
        y_[i] = other.y_[i];
    }
}

StickerSheet::StickerSheet(const StickerSheet &other)
{
    copy(other);
}

const StickerSheet &StickerSheet::operator=(const StickerSheet &other)
{
    clear();
    copy(other);

    return *this;
}

void StickerSheet::changeMaxStickers(unsigned max)
{
    Image **copy = new Image *[num_stickers];
    unsigned *copy_x = new unsigned[num_stickers];
    unsigned *copy_y = new unsigned[num_stickers];

    for (unsigned i = 0; i < num_stickers; i++)
    {
        copy[i] = NULL;
        copy_x[i] = 0;
        copy_y[i] = 0;
    }

    for (unsigned i = 0; i < num_stickers; i++)
    {
        copy[i] = stickers_[i];
        copy_x[i] = x_[i];
        copy_y[i] = y_[i];
    }

    //prevents mem leak
    delete[] stickers_;
    delete[] x_;
    delete[] y_;

    stickers_ = new Image *[max];
    x_ = new unsigned[max];
    y_ = new unsigned[max];

    if (max >= num_stickers)
    {
        for (unsigned i = 0; i < num_stickers; i++)
        {
            stickers_[i] = copy[i];
            x_[i] = copy_x[i];
            y_[i] = copy_y[i];
        }
        delete[] copy;
        delete[] copy_x;
        delete[] copy_y;
    }
    else
    {
        for (unsigned i = max; i < num_stickers; i++)
        {
            delete copy[i];
            copy[i] = NULL;
        }
        for (unsigned i = 0; i < max; i++)
        {
            stickers_[i] = copy[i];
            x_[i] = copy_x[i];
            y_[i] = copy_y[i];
        }
        num_stickers = max;
        delete[] copy;
        delete[] copy_x;
        delete[] copy_y;
    }
    max_ = max;
}

int StickerSheet::addSticker(Image &sticker, unsigned x, unsigned y)
{
    if (num_stickers < max_)
    {
        stickers_[num_stickers] = new Image(sticker);
        x_[num_stickers] = x;
        y_[num_stickers] = y;

        num_stickers = num_stickers + 1;
        int return_value = int(num_stickers - 1);
        return return_value;
    }
    return -1;
}

bool StickerSheet::translate(unsigned index, unsigned x, unsigned y)
{
    if (index >= num_stickers)
    {
        return false;
    }
    x_[index] = x;
    y_[index] = y;
    return true;
}

void StickerSheet::removeSticker(unsigned index)
{
    if (index >= max_)
    {
        return;
    }

    delete stickers_[index];
    x_[index] = 0;
    y_[index] = 0;

    //shift array - prevents the null error
    unsigned amount_to_iterate = max_ - 1;
    for (unsigned i = index; i < amount_to_iterate; i++)
    {
        stickers_[i] = stickers_[i + 1];
        x_[i] = x_[i + 1];
        y_[i] = y_[i + 1];
    }

    num_stickers = num_stickers - 1;
    stickers_[max_ - 1] = NULL;
    x_[max_ - 1] = 0;
    y_[max_ - 1] = 0;
}

Image *StickerSheet::getSticker(unsigned index)
{
    if (index < num_stickers)
    {
        return stickers_[index];
    }
    return NULL;
}

Image StickerSheet::render() const
{
    Image *output = new Image(*base_picture);

    for (unsigned i = 0; i < num_stickers; i++)
    {
        unsigned w = stickers_[i]->width();
        unsigned h = stickers_[i]->height();

        unsigned total_w = w + x_[i];
        unsigned total_h = h + y_[i];

        unsigned setting_w = std::max(total_w, output->width());
        unsigned setting_h = std::max(total_h, output->height());

        output->resize(setting_w, setting_h);

        for (unsigned x = 0; x < w; x++)
        {
            for (unsigned y = 0; y < h; y++)
            {
                HSLAPixel &output_pixel = output->getPixel(x + x_[i], y + y_[i]);
                HSLAPixel &image_pixel = stickers_[i]->getPixel(x, y);
                if (image_pixel.a != 0)
                {
                    output_pixel = image_pixel;
                }
            }
        }
    }

    Image return_output = *output;
    delete output;
    output = NULL;
    return return_output;
}
