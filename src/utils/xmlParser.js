import { XMLParser } from 'fast-xml-parser';

/**
 * Parse XML string to JSON
 */
export const parseXML = async (xmlString) => {
  const options = {
    ignoreAttributes: false,
    removeNSPrefix: true,  // Remove ns2: prefixes
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    isArray: () => false  // Don't force arrays
  };
  
  const parser = new XMLParser(options);
  
  try {
    const result = parser.parse(xmlString);
    return result;
  } catch (error) {
    console.error('XML parsing error:', error);
    throw new Error(`Failed to parse XML: ${error.message}`);
  }
};

const normalizeText = (value) => {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return normalizeText(value[0]);
  }

  if (typeof value === 'object') {
    return normalizeText(value['#text'] ?? value.__cdata ?? value._text ?? value.text ?? '');
  }

  return '';
};

const extractLeafletMetadata = (leafletJson) => {
  const root = leafletJson['ns2:LeafletRequest'] || leafletJson.LeafletRequest;
  const layout = root?.DanskSupermarked?.AdvertisingLayout;

  const validFrom = normalizeText(layout?.ValidityPeriod?.StartDate);
  const validTo = normalizeText(layout?.ValidityPeriod?.EndDate);

  return {
    promotionEventId: normalizeText(layout?.PromotionEventID),
    promotionEventName: normalizeText(layout?.PromotionEventName),
    tacticName: normalizeText(layout?.TacticName),
    campaignId: normalizeText(layout?.CampaignID),
    validFrom,
    validTo,
  };
};

/**
 * Extract Areas from IPR XML
 */
const extractIPRAreas = (iprJson) => {
  const root = iprJson['ns2:ImageProductionRequest'] || iprJson.ImageProductionRequest;
  if (!root) return [];
  
  const marketVersion = root.DanskSupermarked?.AdvertisingLayout?.MarketVersion;
  if (!marketVersion || !marketVersion.Area) return [];
  
  const areas = Array.isArray(marketVersion.Area) ? marketVersion.Area : [marketVersion.Area];
  
  return areas.map(area => ({
    id: normalizeText(area.ID),
    name: normalizeText(area.Name),
    pageNumber: parseInt(normalizeText(area.PageOrdinalNumberValue), 10) || 0,
    templateId: normalizeText(area.MarketVersionTemplateID),
    templateName: normalizeText(area.MarketVersionTemplateName),
    imageRequests: extractImageRequests(area.ImageRequest)
  }));
};

/**
 * Extract ImageRequests from Area
 */
const extractImageRequests = (imageRequests) => {
  if (!imageRequests) return [];
  
  const requests = Array.isArray(imageRequests) ? imageRequests : [imageRequests];
  
  return requests.map(req => ({
    requestId: req.RequestID,
    offerId: req.OfferID,
    groupNumber: req.GroupOrdinalNumberValue,
    priority: req.Priority,
    headline: req.ProductHeadline,
    photoStatus: extractPhotoStatus(req.PhotoStatus),
    products: extractProducts(req.OfferProductInImage)
  }));
};

/**
 * Extract photo status and image URLs
 */
const extractPhotoStatus = (photoStatus) => {
  if (!photoStatus) return { status: 'NONE', images: [] };
  
  const images = [];
  
  if (photoStatus.Archive) {
    images.push({
      url: photoStatus.Archive,
      source: photoStatus.Source || 'Archive',
      publicId: photoStatus.PublicID || '',
      sourceId: photoStatus.SourceID || ''
    });
  }
  
  return {
    status: photoStatus.Shoot || photoStatus.Archive || photoStatus.File || 'UNKNOWN',
    images
  };
};

/**
 * Extract product information
 */
const extractProducts = (offerProductInImage) => {
  if (!offerProductInImage) return [];
  
  const products = Array.isArray(offerProductInImage) ? offerProductInImage : [offerProductInImage];
  
  return products.map(item => {
    const product = item.Product || {};
    return {
      productNumber: normalizeText(product.ProductNumber),
      description: normalizeText(product.ProductDescription),
      bodyText: normalizeText(product.BodyText),
      logo: normalizeText(product.Logo),
      sector: normalizeText(product.Sector),
      purchasingGroup: normalizeText(product.PurchasingGroup),
      purchasingGroupDescription: normalizeText(product.PurchasingGroupDescription)
    };
  });
};

/**
 * Extract Areas from Leaflet XML
 */
const extractLeafletAreas = (leafletJson) => {
  const root = leafletJson['ns2:LeafletRequest'] || leafletJson.LeafletRequest;
  if (!root) return [];
  
  const marketVersion = root.DanskSupermarked?.AdvertisingLayout?.MarketVersion;
  if (!marketVersion || !marketVersion.Area) return [];
  
  const areas = Array.isArray(marketVersion.Area) ? marketVersion.Area : [marketVersion.Area];
  
  return areas.map(area => ({
    id: normalizeText(area.ID),
    name: normalizeText(area.Name),
    pageNumber: parseInt(normalizeText(area.PageOrdinalNumberValue), 10) || 0,
    templateId: normalizeText(area.MarketVersionTemplateID),
    templateName: normalizeText(area.MarketVersionTemplateName),
    blocks: extractBlocks(area.Block)
  }));
};

/**
 * Extract Blocks from Area
 */
const extractBlocks = (blocks) => {
  if (!blocks) return [];
  
  const blockArray = Array.isArray(blocks) ? blocks : [blocks];
  
  return blockArray.map(block => ({
    blockId: normalizeText(block.BlockID),
    blockName: normalizeText(block.BlockName),
    priority: normalizeText(block.Priority),
    offer: block.Offer ? extractOffer(block.Offer) : null
  }));
};

/**
 * Extract Offer from Block
 */
const extractOffer = (offer) => {
  if (!offer) return null;
  
  return {
    id: normalizeText(offer.ID),
    name: normalizeText(offer.Name),
    purchasingGroup: normalizeText(offer.PurchasingGroup),
    purchasingGroupDescription: normalizeText(offer.PurchasingGroupDescription),
    boxes: extractBoxes(offer.Box)
  };
};

/**
 * Extract Boxes from Offer
 */
const extractBoxes = (boxes) => {
  if (!boxes) return [];
  
  const boxArray = Array.isArray(boxes) ? boxes : [boxes];
  
  return boxArray.map(box => ({
    ordinal: normalizeText(box.OrdinalNumberValue),
    boxId: normalizeText(box.BoxID),
    groupOrdinal: normalizeText(box.GroupOrdinalNumberValue),
    template: box.ContentTemplate ? extractContentTemplate(box.ContentTemplate) : null
  }));
};

/**
 * Extract ContentTemplate from Box
 */
const extractContentTemplate = (template) => {
  if (!template) return null;
  
  const boxes = template.Box ? (Array.isArray(template.Box) ? template.Box : [template.Box]) : [];
  
  const content = {};
  boxes.forEach(box => {
    const propName = normalizeText(box.PropertyName);
    const text = normalizeText(box.Text);
    
    if (propName.includes('Headline') || propName.includes('headline')) {
      content.headline = text;
    } else if (propName.includes('Body') || propName.includes('body')) {
      content.bodyText = text;
    } else if (propName.includes('Price') || propName.includes('price')) {
      content.price = text;
    } else if (propName.includes('Logo') || propName.includes('logo')) {
      content.logo = text;
    } else if (propName.includes('Image') && (box.ImageFileContentURI || box.HighResolutionImageFileContentURI)) {
      if (!content.images) content.images = [];
      content.images.push({
        url: normalizeText(box.ImageFileContentURI),
        highResUrl: normalizeText(box.HighResolutionImageFileContentURI),
        source: normalizeText(box.Source),
        publicId: normalizeText(box.PublicID)
      });
    } else if (propName.includes('SalesCondition')) {
      content.salesCondition = text;
    } else if (propName.toLowerCase().includes('salespricetext') || propName.toLowerCase().includes('disc')) {
      // Promo badge copy like "Frit valg" or "Ta' 3 for 2".
      if (!content.salesText && text) content.salesText = text;
    } else if (propName.toLowerCase().includes('buy quantity')) {
      if (!content.buyQuantity && text) content.buyQuantity = text;
    } else if (
      /(regular price|reg price|normalpris|normal price|current regular price)/i.test(propName)
    ) {
      if (!content.normalPrice && text) content.normalPrice = text;
    }
  });
  
  return content;
};

/**
 * Merge IPR and Leaflet data
 */
export const mergeXMLs = (iprJson, leafletJson) => {
  const iprAreas = extractIPRAreas(iprJson);
  const leafletAreas = extractLeafletAreas(leafletJson);
  const leafletMeta = extractLeafletMetadata(leafletJson);
  
  // Create a map of IPR data by OfferID
  const iprDataByOfferId = {};
  iprAreas.forEach(area => {
    area.imageRequests.forEach(req => {
      if (!iprDataByOfferId[req.offerId]) {
        iprDataByOfferId[req.offerId] = [];
      }
      iprDataByOfferId[req.offerId].push({
        areaId: area.id,
        headline: req.headline,
        photoStatus: req.photoStatus,
        products: req.products
      });
    });
  });
  
  // Merge data by Area ID
  const mergedAreas = leafletAreas.map(leafletArea => {
    const mergedBlocks = leafletArea.blocks.map(block => {
      if (!block.offer) return block;
      
      const offerId = block.offer.id;
      const iprData = iprDataByOfferId[offerId] || [];
      
      // Collect unique images from IPR and Leaflet
      const images = new Set();
      const imageDetails = [];
      
      // Add images from Leaflet boxes
      block.offer.boxes.forEach(box => {
        if (box.template && box.template.images) {
          box.template.images.forEach(img => {
            if (img.publicId && !images.has(img.publicId)) {
              images.add(img.publicId);
              imageDetails.push(img);
            }
          });
        }
      });
      
      // Add images from IPR
      iprData.forEach(data => {
        data.photoStatus.images.forEach(img => {
          if (img.publicId && !images.has(img.publicId)) {
            images.add(img.publicId);
            imageDetails.push({
              url: img.url,
              highResUrl: img.url,
              source: img.source,
              publicId: img.publicId
            });
          }
        });
      });
      
      // Merge content from boxes
      let mergedHeadline = '';
      let mergedBodyText = '';
      let mergedPrice = '';
      let mergedLogo = '';
      let mergedNormalPrice = '';
      let mergedSalesText = '';
      let mergedBuyQuantity = '';
      let mergedSalesCondition = '';
      
      block.offer.boxes.forEach(box => {
        if (box.template) {
          if (box.template.headline) mergedHeadline = box.template.headline;
          if (box.template.bodyText) mergedBodyText = box.template.bodyText;
          if (box.template.price) mergedPrice = box.template.price;
          if (box.template.logo) mergedLogo = box.template.logo;
          if (box.template.normalPrice) mergedNormalPrice = box.template.normalPrice;
          if (box.template.salesText) mergedSalesText = box.template.salesText;
          if (box.template.buyQuantity) mergedBuyQuantity = box.template.buyQuantity;
          if (box.template.salesCondition) mergedSalesCondition = box.template.salesCondition;
        }
      });
      
      // Add product details from IPR
      const products = [];
      iprData.forEach(data => {
        products.push(...data.products);
      });
      
      return {
        ...block,
        offer: {
          ...block.offer,
          headline: mergedHeadline || block.offer.name,
          bodyText: mergedBodyText,
          price: mergedPrice,
          normalPrice: mergedNormalPrice,
          salesText: mergedSalesText,
          buyQuantity: mergedBuyQuantity,
          salesCondition: mergedSalesCondition,
          logo: mergedLogo,
          images: imageDetails,
          products: products
        }
      };
    });
    
    return {
      id: leafletArea.id,
      name: leafletArea.name,
      pageNumber: leafletArea.pageNumber,
      templateId: leafletArea.templateId,
      templateName: leafletArea.templateName,
      blocks: mergedBlocks
    };
  });
  
  // Sort areas by page number
  mergedAreas.sort((a, b) => a.pageNumber - b.pageNumber);
  
  return {
    areas: mergedAreas,
    metadata: {
      totalPages: mergedAreas.length,
      ...leafletMeta
    }
  };
};

/**
 * Load XML file pair
 */
export const loadXMLPair = async (iprFile, leafletFile) => {
  try {
    const iprText = await iprFile.text();
    const leafletText = await leafletFile.text();
    
    const iprJson = await parseXML(iprText);
    const leafletJson = await parseXML(leafletText);
    
    const mergedData = mergeXMLs(iprJson, leafletJson);
    
    return {
      success: true,
      data: mergedData,
      raw: {
        iprText,
        leafletText
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};
